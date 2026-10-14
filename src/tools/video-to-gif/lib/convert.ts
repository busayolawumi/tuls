import { fetchFile } from '@ffmpeg/util'
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import {
  errorKind,
  getEngine,
  resetEngine,
  run,
  type EngineErrorKind,
} from '../../../engines/ffmpeg/engine'
import type { Crop } from './crop'

export { getDuration, preloadEngine } from '../../../engines/ffmpeg/engine'

export type ConvertOptions = {
  /** Where the clip starts, in seconds. */
  start: number
  /** Where the clip ends, in seconds. */
  end: number
  /**
   * Length of the longer side in pixels, so portrait and landscape videos
   * come out the same size. Smaller videos are not scaled up.
   */
  size: number
  fps: number
  /** The part of the picture to keep, in video pixels. Omit to keep it all. */
  crop?: Crop
}

export type ConvertProgress =
  // `ratio` is set while the engine is still downloading (first visit).
  | { stage: 'loading'; ratio?: number }
  | { stage: 'analysing' }
  | { stage: 'encoding'; ratio: number }

/** Why a conversion failed, so the UI can say something useful. */
export type ConvertErrorKind = EngineErrorKind

export class ConvertError extends Error {
  kind: ConvertErrorKind
  constructor(kind: ConvertErrorKind, cause: unknown) {
    super(`Couldn't make the GIF (${kind})`, { cause })
    this.kind = kind
  }
}

const INPUT = 'input'
const PALETTE = 'palette.png'
const OUTPUT = 'output.gif'

/**
 * Makes a GIF from part of a video. Aborting `signal` cancels it, and the
 * promise then rejects with the signal's reason. Other failures reject with
 * a ConvertError that says what kind of problem it was.
 */
export async function convert(
  file: File,
  options: ConvertOptions,
  onProgress?: (progress: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted()
  // On a first visit the engine may still be downloading, so pass on its
  // progress while waiting for it.
  let ffmpeg: FFmpeg
  try {
    ffmpeg = await getEngine((ratio) =>
      onProgress?.({ stage: 'loading', ratio }),
    )
  } catch (e) {
    console.error(e)
    throw new ConvertError(errorKind(e, 'network'), e)
  }
  signal?.throwIfAborted()
  // Downloaded. Now copying the video in, which takes a moment for big files.
  onProgress?.({ stage: 'loading' })

  const stop = () => resetEngine(ffmpeg)
  signal?.addEventListener('abort', stop, { once: true })

  const { start, end, size, fps, crop } = options
  const duration = end - start
  // -ss before -i seeks quickly and makes the clip's timestamps start at 0.
  const input = [
    '-ss',
    start.toFixed(3),
    '-t',
    duration.toFixed(3),
    '-i',
    INPUT,
  ]
  // Crop first (FFmpeg has already turned phone videos upright, so the crop's
  // coordinates match the preview's), then fit inside a size×size box,
  // keeping the aspect ratio.
  const cropFilter = crop
    ? `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},`
    : ''
  const filters = `${cropFilter}fps=${fps},scale='min(${size},iw)':'min(${size},ih)':force_original_aspect_ratio=decrease:flags=lanczos`
  // -map_metadata -1 drops everything copied from the video, such as the
  // phone model and the GPS location, so a GIF can never carry them.
  const output = ['-map_metadata', '-1', '-loop', '0', OUTPUT]

  // `time` is how much of the GIF has been written, in microseconds.
  const reportEncoding = ({ time }: { time: number }) => {
    const ratio = Math.min(Math.max(time / (duration * 1e6), 0), 1)
    onProgress?.({ stage: 'encoding', ratio })
  }

  try {
    await ffmpeg.writeFile(INPUT, await fetchFile(file))

    // Two passes: the first builds a palette from the clip's own colours, and
    // the second uses it. Doing it in one pass would hold every frame in
    // memory, which phones can't afford. The first pass only writes one frame
    // at the very end, so it has no useful progress to report.
    onProgress?.({ stage: 'analysing' })
    await run(ffmpeg, [
      ...input,
      '-vf',
      `${filters},palettegen=stats_mode=diff`,
      PALETTE,
    ])

    onProgress?.({ stage: 'encoding', ratio: 0 })
    ffmpeg.on('progress', reportEncoding)
    await run(ffmpeg, [
      ...input,
      '-i',
      PALETTE,
      '-lavfi',
      // Pattern (bayer) dithering hides colour banding on camera footage and
      // stays stable between frames. diff_mode=rectangle only re-encodes the
      // part of each frame that changed.
      `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
      ...output,
    ])

    const data = (await ffmpeg.readFile(OUTPUT)) as Uint8Array<ArrayBuffer>
    return new Blob([data], { type: 'image/gif' })
  } catch (e) {
    // Shutting the engine down makes its unfinished work fail. Report that as
    // the cancel it really was.
    if (signal?.aborted) throw signal.reason
    const kind = errorKind(e, 'unknown')
    // FFmpeg turning a video down is a normal exit, and the engine is fine.
    // Anything else may have broken it, so start a fresh one.
    if (kind !== 'unreadable') resetEngine(ffmpeg)
    throw new ConvertError(kind, e)
  } finally {
    signal?.removeEventListener('abort', stop)
    ffmpeg.off('progress', reportEncoding)
    // Free the memory these take up inside ffmpeg.wasm. If the engine was shut
    // down (cancel or crash), it's all gone already.
    if (ffmpeg.loaded) {
      await Promise.allSettled(
        [INPUT, PALETTE, OUTPUT].map((path) => ffmpeg.deleteFile(path)),
      )
    }
  }
}
