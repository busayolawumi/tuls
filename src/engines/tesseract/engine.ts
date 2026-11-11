import type Tesseract from 'tesseract.js'
import { within } from '../within'
import { coreFile, saveEngine } from './download'
import { OcrError } from './errors'

// Text recognition: Tesseract, one reader per worker, several side by side
// on a computer. Readers are started for a language and kept while the page
// is open. Every read has a time limit, and Cancel (stopEngine) ends them all
// at once, even mid-page.

export type Reader = Tesseract.Worker

export type EngineStep =
  { step: 'download'; ratio: number } | { step: 'start' } | { step: 'read' }

/** What reading one picture found, and its text as an invisible PDF page. */
export type PageRead = {
  /** Tesseract's mean confidence in its words, 0–100. */
  confidence: number
  words: number
  layer?: Uint8Array<ArrayBuffer>
}

// Starting took 0.2–0.6 s on a laptop, once downloaded.
const START_LIMIT = 60_000
const START_LIMIT_DOWNLOADING = 600_000
// A dense form took 10 s on a laptop. Room for phones.
const READ_LIMIT = 180_000
const KEEP_FOR = 60_000
const LSTM_ONLY = 1

let library: Promise<typeof Tesseract> | undefined
let current: { language: string; readers: Reader[] } | undefined
let download: AbortController | undefined
let generation = 0
let idle: ReturnType<typeof setTimeout> | undefined
const stops = new Set<(reason: unknown) => void>()
// tesseract.js throws, uncaught, if a stopped reader is asked to do anything.
const ended = new WeakSet<Reader>()

const tesseract = () =>
  (library ??= import('tesseract.js/dist/tesseract.esm.min.js').then(
    (module) => module.default,
  ))

const stopped = () => new OcrError('unknown', 'Stopped')

/** `promise`, unless stopEngine comes first. */
function stoppable<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    stops.add(reject)
    promise.then(resolve, reject).finally(() => stops.delete(reject))
  })
}

async function startReader(language: string, limit: number) {
  const [lib, core] = await Promise.all([tesseract(), coreFile()])
  const starting = lib.createWorker(language, LSTM_ONLY, {
    workerPath: __TESSERACT__.worker,
    corePath: core.url,
    langPath: __TESSERACT__.dir.replace(/\/$/, ''),
    cacheMethod: 'none',
    workerBlobURL: false,
    gzip: true,
    // Failed jobs reject their promise; without this, they'd also throw.
    errorHandler: () => {},
  })
  try {
    return await within(
      starting,
      limit,
      () => new OcrError('stuck', `No start in ${limit / 1000} s`),
    )
  } catch (e) {
    void starting.then(end).catch(() => {})
    throw e
  }
}

function end(reader: Reader) {
  ended.add(reader)
  void reader.terminate()
}

/**
 * `count` readers for `language`, downloading and starting them if needed.
 * `onStep` hears what's happening.
 */
export async function readersFor(
  language: string,
  count: number,
  onStep: (step: EngineStep) => void,
): Promise<Reader[]> {
  clearTimeout(idle)
  if (current?.language !== language) {
    stopEngine()
    current = { language, readers: [] }
  }
  const mine = current
  const missing = count - mine.readers.length
  if (missing <= 0) return mine.readers.slice(0, count)

  const started = generation
  download = new AbortController()
  const saved = await stoppable(
    saveEngine(
      language,
      (ratio) => onStep({ step: 'download', ratio }),
      download.signal,
    ),
  )
  onStep({ step: 'start' })
  const limit = saved ? START_LIMIT : START_LIMIT_DOWNLOADING
  // Without a saved copy, every reader would download the language itself:
  // one goes first, and the rest find it in the browser's cache.
  const first = saved ? [] : [await stoppable(startReader(language, limit))]
  const results = await stoppable(
    Promise.allSettled(
      Array.from({ length: missing - first.length }, () =>
        startReader(language, limit),
      ),
    ),
  )
  const made = [
    ...first,
    ...results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
  ]
  const failure = results.find((result) => result.status === 'rejected')
  if (failure || started !== generation || current !== mine) {
    for (const reader of made) end(reader)
    throw started !== generation ? stopped() : failure?.reason
  }
  mine.readers.push(...made)
  return mine.readers.slice(0, count)
}

const WORD = /[\p{L}\p{N}]+/gu

/**
 * Reads one picture of a page drawn at `dpi`. With `layer`, its text comes
 * back as an invisible PDF page that size, to lay over the page.
 */
export async function readPicture(
  reader: Reader,
  picture: Blob,
  dpi: number,
  layer: boolean,
): Promise<PageRead> {
  const bytes = new Uint8Array(await picture.arrayBuffer())
  // Checked just before each call. Bytes go in as they are, so nothing waits
  // between the check and the call, and Cancel can't come in between.
  const live = () => {
    if (ended.has(reader)) throw stopped()
  }
  const read = (async () => {
    live()
    await reader.setParameters({ user_defined_dpi: String(dpi) })
    live()
    return reader.recognize(
      bytes,
      { pdfTextOnly: true },
      { text: true, pdf: layer },
    )
  })()
  const { data } = await stoppable(
    within(
      read,
      READ_LIMIT,
      () => new OcrError('stuck', `No answer in ${READ_LIMIT / 1000} s`),
    ),
  )
  return {
    confidence: data.confidence,
    words: data.text.match(WORD)?.length ?? 0,
    layer: data.pdf ? new Uint8Array(data.pdf) : undefined,
  }
}

/** Stops every reader at once, mid-download or mid-page (Cancel). */
export function stopEngine() {
  generation++
  download?.abort()
  for (const reader of current?.readers ?? []) end(reader)
  current = undefined
  for (const stop of stops) stop(stopped())
  stops.clear()
}

/** The page using the readers has opened: keep them. */
export function holdEngine() {
  clearTimeout(idle)
}

/** The page has gone. Stop the readers soon, freeing their memory. */
export function releaseEngine() {
  clearTimeout(idle)
  idle = setTimeout(stopEngine, KEEP_FOR)
}
