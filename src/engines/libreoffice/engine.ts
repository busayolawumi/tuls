import { Converter } from './converter'
import { saveEngine } from './download'
import { OfficeError, officeErrorKind } from './errors'
import { extensionOf, languageTag } from './files'
import { prepareOffice } from './ooxml/prepare'

// The shared LibreOffice engine, for Word, Excel and PowerPoint to PDF: saved
// on the device on first use, started once and kept while the page is open,
// and watched. LibreOffice gets stuck now and then (CLAUDE.md, spike), and
// when it fails it often just stops answering, so every step has a time
// limit, and a stuck or crashed engine is replaced and the work tried again.

/** What the engine is doing, for the page to show. */
export type EngineStep =
  { step: 'download'; ratio: number } | { step: 'start' } | { step: 'convert' }

// From the device, starting takes 2–7 s on a laptop or an iPhone 15.
const START_LIMIT = 90_000
// Unless the browser couldn't save the engine, so it downloads it as it starts.
const START_LIMIT_DOWNLOADING = 600_000
// Normally 1–2 s. Room for a busy or slow device, so a working engine isn't
// mistaken for a stuck one.
const WARM_UP_LIMIT = 30_000
// 100 Word pages took 1.8 s on a laptop, and a 37 MB slide deck 5.8 s.
const CONVERT_LIMIT = 90_000
const CONVERT_LIMIT_PER_MB = 3_000
// How long the engine stays after the last page using it has gone.
const KEEP_FOR = 60_000

let ready: Promise<Converter> | undefined
let current: Converter | undefined
let download: AbortController | undefined
// Bumped by stopEngine, so a start that was cancelled meanwhile gives up.
let generation = 0
let listener: ((step: EngineStep) => void) | undefined
let idle: ReturnType<typeof setTimeout> | undefined

/** Logged each time the engine is replaced, with the reason. */
export const RESTARTED = 'LibreOffice stopped answering, so it was restarted.'

/** Fails with a "stuck" error if `promise` takes longer than `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new OfficeError('stuck', `No answer in ${ms / 1000} s`)),
      ms,
    )
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

// A tiny document converted straight after starting. The first conversion
// is the one most likely to get stuck, and it's quicker to find out on this
// than on someone's 50-page report.
const warmUp = () => new TextEncoder().encode('Tuls')

async function startOnce(saved: boolean) {
  const converter = new Converter()
  try {
    await within(
      converter.start(),
      saved ? START_LIMIT : START_LIMIT_DOWNLOADING,
    )
    await within(converter.toPdf(warmUp(), 'txt'), WARM_UP_LIMIT)
    return converter
  } catch (e) {
    converter.stop()
    throw e
  }
}

function load(): Promise<Converter> {
  if (ready) return ready
  const started = generation
  download = new AbortController()
  const signal = download.signal
  const loading = (async () => {
    const saved = await saveEngine(
      (ratio) => listener?.({ step: 'download', ratio }),
      signal,
    )
    listener?.({ step: 'start' })
    let converter: Converter
    try {
      converter = await startOnce(saved)
    } catch (e) {
      // One more go, unless it couldn't even download.
      if (officeErrorKind(e) === 'network' || started !== generation) throw e
      console.warn(RESTARTED, e)
      converter = await startOnce(saved)
    }
    if (started !== generation) {
      converter.stop()
      throw new OfficeError('unknown', 'Stopped')
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

// Office Open XML files, which Tuls changes a little before converting.
const OOXML = ['docx', 'xlsx', 'xlsm', 'pptx', 'ppsx']

/**
 * The document's bytes, with Tuls's changes for Office behaviour
 * LibreOffice lacks (ooxml/prepare.ts). If preparing fails, it's converted
 * as it is.
 */
async function documentBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!OOXML.includes(extensionOf(file.name))) return bytes
  try {
    return (await prepareOffice(bytes)) ?? bytes
  } catch (e) {
    console.warn(
      'Couldn’t prepare the document, so it’s converted as it is.',
      e,
    )
    return bytes
  }
}

/**
 * Converts a document to PDF, downloading and starting the engine first if
 * needed. `onStep` hears what it's doing.
 */
export async function convertToPdf(
  file: File,
  onStep: (step: EngineStep) => void,
): Promise<Uint8Array> {
  listener = onStep
  const bytes = await documentBytes(file)
  const limit = CONVERT_LIMIT + (CONVERT_LIMIT_PER_MB * file.size) / 1_000_000
  for (let attempt = 1; ; attempt++) {
    const converter = await load()
    onStep({ step: 'convert' })
    try {
      // The converter takes the bytes over, so each go gets its own copy.
      return await within(
        converter.toPdf(
          bytes.slice(),
          extensionOf(file.name),
          languageTag(navigator.language),
        ),
        limit,
      )
    } catch (e) {
      const kind = officeErrorKind(e)
      // Stuck or crashed: replace the engine, and try once more, unless it
      // ran out of memory, which would only happen again.
      if (kind === 'stuck' || converter.stopped) {
        stopEngine()
        if (attempt === 1 && kind !== 'memory') {
          console.warn(RESTARTED, e)
          continue
        }
      }
      throw e
    }
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

/** A page using the engine has opened: keep it. */
export function holdEngine() {
  clearTimeout(idle)
}

/**
 * The page using the engine has gone. Stop it soon, freeing its memory,
 * unless another page wants it by then (Word to PDF, then Excel to PDF).
 */
export function releaseEngine() {
  clearTimeout(idle)
  idle = setTimeout(stopEngine, KEEP_FOR)
}
