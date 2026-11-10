import type { ImageFormat } from '../../lib/picture'

export type Pixels = {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export type Level = 'recommended' | 'smallest'
export type Goal = { level: Level } | { under: number }

/** How each format is made smaller. `colours` gives libimagequant's quality range. */
export type Encoders = {
  lossy: (pixels: Pixels, quality: number) => Promise<Uint8Array>
  exact: (pixels: Pixels) => Promise<Uint8Array>
  colours: (
    pixels: Pixels,
    min: number,
    target: number,
  ) => Promise<Uint8Array | undefined>
  resize: (pixels: Pixels, width: number, height: number) => Promise<Pixels>
}

export const QUALITY: Record<Level, number> = { recommended: 75, smallest: 60 }
export const COLOURS: Record<Level, [number, number]> = {
  recommended: [65, 90],
  smallest: [30, 80],
}
/** Smallest makes very big pictures this many pixels across, at most. */
export const SMALLEST_SIDE = 2560
/** Below this, photos turn blotchy, so a picture is made smaller instead. */
export const FLOOR = 40
/** Above this, files grow fast for little that can be seen. */
export const TOP = 85
/** libimagequant can't take more pixels than this. */
export const MAX_COLOUR_PIXELS = 16_777_216
/** Only pictures up to this size get an exact try first: it's slow. */
const EXACT_FIRST = 4_000_000
const ROUNDS = 6

export type Compressed = { bytes: Uint8Array; width: number; height: number }

/** The size that fits within `side` both ways, keeping proportions. */
export function withinSide(width: number, height: number, side: number) {
  const scale = Math.min(1, side / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function capped(pixels: Pixels, level: Level, encoders: Encoders) {
  if (level !== 'smallest') return pixels
  const size = withinSide(pixels.width, pixels.height, SMALLEST_SIDE)
  if (size.width === pixels.width) return pixels
  return encoders.resize(pixels, size.width, size.height)
}

async function png(
  pixels: Pixels,
  [min, target]: [number, number],
  encoders: Encoders,
) {
  const fewer =
    pixels.width * pixels.height <= MAX_COLOUR_PIXELS
      ? await encoders.colours(pixels, min, target)
      : undefined
  return fewer ?? encoders.exact(pixels)
}

type Try = { bytes?: Uint8Array; size: number }

async function lossyUnder(
  pixels: Pixels,
  under: number,
  encoders: Encoders,
): Promise<Try> {
  const top = await encoders.lossy(pixels, TOP)
  if (top.length <= under) return { bytes: top, size: top.length }
  const floor = await encoders.lossy(pixels, FLOOR)
  if (floor.length > under) return { size: floor.length }
  let best = floor
  let low = FLOOR
  let high = TOP
  while (high - low > 5) {
    const middle = Math.round((low + high) / 2)
    const bytes = await encoders.lossy(pixels, middle)
    if (bytes.length <= under) {
      best = bytes
      low = middle
    } else {
      high = middle
    }
  }
  return { bytes: best, size: best.length }
}

async function pngUnder(
  pixels: Pixels,
  under: number,
  encoders: Encoders,
  first: boolean,
): Promise<Try> {
  let size = pixels.width * pixels.height * 4
  if (first && pixels.width * pixels.height <= EXACT_FIRST) {
    const exact = await encoders.exact(pixels)
    if (exact.length <= under) return { bytes: exact, size: exact.length }
    size = exact.length
  }
  if (pixels.width * pixels.height <= MAX_COLOUR_PIXELS) {
    const fewer = await encoders.colours(pixels, 0, 100)
    if (fewer && fewer.length <= under)
      return { bytes: fewer, size: fewer.length }
    if (fewer) size = fewer.length
  }
  return { size }
}

/**
 * A smaller file of the picture: at a level, or under a size in bytes. Under
 * a size, the quality comes down first (to FLOOR), then the picture is made
 * smaller, each time from the original. Undefined if it can't get under.
 */
export async function compressPixels(
  pixels: Pixels,
  format: ImageFormat,
  goal: Goal,
  encoders: Encoders,
): Promise<Compressed | undefined> {
  if ('level' in goal) {
    const picture = await capped(pixels, goal.level, encoders)
    const bytes =
      format === 'png'
        ? await png(picture, COLOURS[goal.level], encoders)
        : await encoders.lossy(picture, QUALITY[goal.level])
    return { bytes, width: picture.width, height: picture.height }
  }

  let picture = pixels
  for (let round = 0; round < ROUNDS; round++) {
    const attempt =
      format === 'png'
        ? await pngUnder(picture, goal.under, encoders, round === 0)
        : await lossyUnder(picture, goal.under, encoders)
    if (attempt.bytes) {
      return {
        bytes: attempt.bytes,
        width: picture.width,
        height: picture.height,
      }
    }
    const scale = Math.min(0.9, Math.sqrt(goal.under / attempt.size) * 0.95)
    const width = Math.round(picture.width * scale)
    const height = Math.round(picture.height * scale)
    if (width < 16 || height < 16) return undefined
    picture = await encoders.resize(pixels, width, height)
  }
  return undefined
}
