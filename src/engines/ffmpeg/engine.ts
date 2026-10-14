import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

// The shared FFmpeg engine (ffmpeg.wasm): loading it with download progress,
// starting over after a cancel or crash, and running commands. What to run is
// up to each tool.

/** Why a run failed, so a tool can say something useful. */
export type EngineErrorKind = 'network' | 'memory' | 'unreadable' | 'unknown'

// Matched against error messages and FFmpeg's last log lines.
const MEMORY_ERRORS =
  /out of memory|\bOOM\b|Cannot enlarge memory|memory access out of bounds|Array buffer allocation failed|could not allocate memory/i
const UNREADABLE_ERRORS =
  /Invalid data found|could not find codec parameters|Decoder .{0,40}not found|moov atom not found|does not contain any stream|matches no streams|Error while decoding/i

export function errorKind(
  error: unknown,
  fallback: EngineErrorKind,
): EngineErrorKind {
  const text = error instanceof Error ? error.message : String(error)
  if (MEMORY_ERRORS.test(text)) return 'memory'
  if (UNREADABLE_ERRORS.test(text)) return 'unreadable'
  return fallback
}

// Separate names, so reading a video's length can't clash with a tool's run.
const PROBE_INPUT = 'probe-input'
const PROBE_OUTPUT = 'probe.txt'

let engine: Promise<FFmpeg> | undefined
let engineReady = false
// How much of the engine has downloaded (0–1), and who wants to know.
let downloaded = 0
const downloadListeners = new Set<(ratio: number) => void>()

/** Downloads a file, reporting progress against its known size. */
async function download(
  url: string,
  size: number,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`)
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onProgress(Math.min(received / size, 1))
  }
  return new Blob(chunks, { type: 'application/wasm' })
}

// The core is ~32MB, so it's only downloaded once a file has been chosen.
// It's the single-threaded core on purpose: the multi-threaded one deadlocks
// on iPhone (HEVC) videos, so conversions would hang forever. See CLAUDE.md.
function loadEngine() {
  if (!engine) {
    engine = (async () => {
      const ffmpeg = new FFmpeg()
      if (import.meta.env.DEV) {
        // FFmpeg's own output, under "Verbose" in the browser console.
        ffmpeg.on('log', ({ message }) => console.debug('[ffmpeg]', message))
      }
      // Download the engine ourselves to show progress, then hand it to
      // FFmpeg as a blob URL. After the first visit it comes from the cache.
      let lastPercent = -1
      const wasm = await download(wasmURL, __FFMPEG_WASM_SIZE__, (ratio) => {
        downloaded = ratio
        const percent = Math.floor(ratio * 100)
        if (percent === lastPercent) return
        lastPercent = percent
        downloadListeners.forEach((listener) => listener(ratio))
      })
      const wasmBlobURL = URL.createObjectURL(wasm)
      try {
        await ffmpeg.load({ coreURL, wasmURL: wasmBlobURL })
      } finally {
        URL.revokeObjectURL(wasmBlobURL)
      }
      engineReady = true
      return ffmpeg
    })()
    // Let the next run try again if this load failed.
    engine.catch(() => {
      engine = undefined
      downloaded = 0
    })
  }
  return engine
}

/** Starts downloading the engine early, so it's ready by the time it's needed. */
export function preloadEngine() {
  // A failure here shows up on the next run, which tries again.
  loadEngine().catch(() => {})
}

/**
 * Waits for the engine. On a first visit it may still be downloading, and
 * `onDownload` hears how far it's got (0–1).
 */
export async function getEngine(
  onDownload?: (ratio: number) => void,
): Promise<FFmpeg> {
  if (engineReady || !onDownload) return loadEngine()
  onDownload(downloaded)
  downloadListeners.add(onDownload)
  try {
    return await loadEngine()
  } finally {
    downloadListeners.delete(onDownload)
  }
}

/**
 * Shuts the engine down and starts loading a fresh one. Needed after a
 * cancel, because FFmpeg can't be stopped mid-run, and after a crash, which
 * can leave it unusable.
 */
export function resetEngine(ffmpeg: FFmpeg) {
  ffmpeg.terminate()
  engine = undefined
  engineReady = false
  downloaded = 0
  preloadEngine()
}

/** Runs one FFmpeg command, failing with its last log lines if it fails. */
export async function run(ffmpeg: FFmpeg, args: string[]) {
  const logs: string[] = []
  const collect = ({ message }: { message: string }) => logs.push(message)
  ffmpeg.on('log', collect)
  try {
    const code = await ffmpeg.exec(args)
    if (code !== 0) {
      throw new Error(
        `ffmpeg exited with ${code}:\n${logs.slice(-15).join('\n')}`,
      )
    }
  } finally {
    ffmpeg.off('log', collect)
  }
}

/** Reads a video's length with FFmpeg, for videos the browser can't open. */
export async function getDuration(file: File): Promise<number> {
  const ffmpeg = await loadEngine()
  try {
    await ffmpeg.writeFile(PROBE_INPUT, await fetchFile(file))
    const code = await ffmpeg.ffprobe([
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      PROBE_INPUT,
      '-o',
      PROBE_OUTPUT,
    ])
    const text = String(await ffmpeg.readFile(PROBE_OUTPUT, 'utf8'))
    const seconds = parseFloat(text)
    if (code !== 0 || !(seconds > 0)) {
      throw new Error(
        `ffprobe couldn't read a duration (exit ${code}): ${text}`,
      )
    }
    return seconds
  } finally {
    await Promise.allSettled(
      [PROBE_INPUT, PROBE_OUTPUT].map((path) => ffmpeg.deleteFile(path)),
    )
  }
}
