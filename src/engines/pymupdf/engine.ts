import { within } from '../within'
import { Converter, type Converted } from './client'
import { saveEngine, saveLightEngine } from './download'
import { WordError, wordErrorKind } from './errors'
import type { Progress } from './progress'
import type { CompressLevel, FoundTable } from './worker'

// The PDF to Word engine: saved on the device on first use, started once and
// kept while the page is open, and watched. Every step has a time limit. A
// conversion isn't tried twice: pdf2docx would only get stuck the same way
// again. Compress PDF starts it light (PyMuPDF only); a full engine, already
// running, compresses too.

/** What the engine is doing, for the page to show. */
export type EngineStep =
  | { step: 'download'; ratio: number }
  | { step: 'start' }
  | { step: 'convert'; progress?: Progress }
  | { step: 'compress' }
  | { step: 'tables' }

// From the device, starting took 4.5–7.4 s on a laptop and 6.7 s on an
// iPhone 15: Python, then PyMuPDF, NumPy and OpenCV.
const START_LIMIT = 120_000
// Unless the browser couldn't save the engine, so it downloads as it starts.
const START_LIMIT_DOWNLOADING = 600_000
// The 15-page research paper took 15–19 s on a laptop. Room for phones and
// pages full of tables.
const CONVERT_LIMIT = 90_000
const CONVERT_LIMIT_PER_PAGE = 6_000
// Compressing the spike's PDFs took 0.1–2.5 s in Node; time is mostly
// spent on images, so the limit goes by size.
const COMPRESS_LIMIT = 60_000
const COMPRESS_LIMIT_PER_MB = 2_000
const TABLES_LIMIT = 60_000
const TABLES_LIMIT_PER_PAGE = 1_000
// How long the engine stays after the page using it has gone.
const KEEP_FOR = 60_000

let ready: Promise<Converter> | undefined
// Whether the engine starting or running is the light one.
let readyLight = false
let current: Converter | undefined
let download: AbortController | undefined
// Bumped by stopEngine, so a start that was cancelled meanwhile gives up.
let generation = 0
let listener: ((step: EngineStep) => void) | undefined
let idle: ReturnType<typeof setTimeout> | undefined

const stuck = (ms: number) => () =>
  new WordError('stuck', `No answer in ${ms / 1000} s`)

async function startOnce(saved: boolean, light: boolean) {
  const converter = new Converter()
  const limit = saved ? START_LIMIT : START_LIMIT_DOWNLOADING
  try {
    await within(converter.start(light), limit, stuck(limit))
    return converter
  } catch (e) {
    converter.stop()
    throw e
  }
}

/**
 * The engine, started if needed. A light one (PyMuPDF only) can compress
 * but not convert, so asking for a full one replaces it.
 */
function load(light = false): Promise<Converter> {
  if (ready && (light || !readyLight)) return ready
  if (ready) stopEngine()
  const started = generation
  download = new AbortController()
  const signal = download.signal
  readyLight = light
  const loading = (async () => {
    const saved = await (light ? saveLightEngine : saveEngine)(
      (ratio) => listener?.({ step: 'download', ratio }),
      signal,
    )
    listener?.({ step: 'start' })
    let converter: Converter
    try {
      converter = await startOnce(saved, light)
    } catch (e) {
      // One more go, unless it couldn't even download.
      if (wordErrorKind(e) === 'network' || started !== generation) throw e
      console.warn(
        'The PDF to Word engine didn’t start, so it was restarted.',
        e,
      )
      converter = await startOnce(saved, light)
    }
    if (started !== generation) {
      converter.stop()
      throw new WordError('unknown', 'Stopped')
    }
    current = converter
    return converter
  })()
  ready = loading
  loading.catch(() => {
    if (ready === loading) ready = undefined
  })
  return loading
}

/**
 * Makes a PDF of `pages` pages into a Word file, downloading and starting
 * the engine first if needed. `onStep` hears what it's doing.
 */
export async function convertToWord(
  file: File,
  pages: number,
  onStep: (step: EngineStep) => void,
): Promise<Converted> {
  listener = onStep
  const pdf = await file.arrayBuffer()
  const converter = await load()
  onStep({ step: 'convert' })
  const limit = CONVERT_LIMIT + CONVERT_LIMIT_PER_PAGE * pages
  try {
    return await within(
      converter.toDocx(pdf, (progress) =>
        onStep({ step: 'convert', progress }),
      ),
      limit,
      stuck(limit),
    )
  } catch (e) {
    // A stuck or crashed engine is no use for the next PDF.
    if (wordErrorKind(e) === 'stuck' || converter.stopped) stopEngine()
    throw e
  }
}

/**
 * Makes a smaller copy of a PDF (tuls_compress.py), downloading and starting
 * the light engine first if needed. `onStep` hears what it's doing.
 */
export async function compressPdf(
  file: File,
  level: CompressLevel,
  onStep: (step: EngineStep) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  listener = onStep
  const pdf = await file.arrayBuffer()
  const converter = await load(true)
  onStep({ step: 'compress' })
  const limit = COMPRESS_LIMIT + (COMPRESS_LIMIT_PER_MB * file.size) / 1e6
  try {
    return await within(converter.compress(pdf, level), limit, stuck(limit))
  } catch (e) {
    // A stuck or crashed engine is no use for the next PDF.
    if (wordErrorKind(e) === 'stuck' || converter.stopped) stopEngine()
    throw e
  }
}

/**
 * Finds the tables in a PDF of `pages` pages (tuls_tables.py), downloading
 * and starting the light engine first if needed.
 */
export async function findTables(
  file: File,
  pages: number,
  onStep: (step: EngineStep) => void,
): Promise<FoundTable[]> {
  listener = onStep
  const pdf = await file.arrayBuffer()
  const converter = await load(true)
  onStep({ step: 'tables' })
  const limit = TABLES_LIMIT + TABLES_LIMIT_PER_PAGE * pages
  try {
    return await within(converter.tables(pdf), limit, stuck(limit))
  } catch (e) {
    if (wordErrorKind(e) === 'stuck' || converter.stopped) stopEngine()
    throw e
  }
}

/** Stops the engine at once, mid-download or mid-conversion (Cancel). */
export function stopEngine() {
  generation++
  download?.abort()
  current?.stop()
  current = undefined
  ready = undefined
}

/** The page using the engine has opened: keep it. */
export function holdEngine() {
  clearTimeout(idle)
}

/** The page has gone. Stop the engine soon, freeing its memory. */
export function releaseEngine() {
  clearTimeout(idle)
  idle = setTimeout(stopEngine, KEEP_FOR)
}
