import { decodeHeif } from '../engines/heif/client'
import { canvasCanKeepP3, isDisplayP3, p3ToSrgb } from './colour'
import { cleanJpeg } from './jpeg'

export type Picture = {
  width: number
  height: number
  /** Kept in Display P3 when saved, where the browser can. */
  p3: boolean
  bitmap: ImageBitmap
}

export type ImageFormat = 'jpeg' | 'png' | 'webp'

const TYPES: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const QUALITY: Record<ImageFormat, number | undefined> = {
  jpeg: 0.92,
  png: undefined,
  webp: 0.9,
}

/** iPhones won't make a canvas bigger than this (about 16.7 megapixels). */
export const PHONE_PIXELS = 16_777_216

/** Whether bytes are a HEIF file: HEIC, HEIF, or a HEIF sequence. */
export function isHeifData(bytes: Uint8Array) {
  if (String.fromCharCode(...bytes.subarray(4, 8)) !== 'ftyp') return false
  const brands = String.fromCharCode(...bytes.subarray(8, 64))
  return /heic|heix|heim|heis|hevc|hevx|mif1|msf1/.test(brands)
}

export class PictureError extends Error {}

/**
 * Opens an image, upright as its details say. The browser opens what it
 * can; HEIC photos it can't (all but Safari) go to libheif.
 */
export async function openPicture(file: Blob): Promise<Picture> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const wideColours = await isDisplayP3(bytes).catch(() => false)
  const p3 = wideColours && canvasCanKeepP3()
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
    return { width: bitmap.width, height: bitmap.height, p3, bitmap }
  } catch (e) {
    if (!isHeifData(bytes)) throw new PictureError('Can’t open', { cause: e })
  }
  const decoded = await decodeHeif(bytes.slice().buffer)
  if (wideColours && !p3) p3ToSrgb(decoded.pixels)
  const data = new ImageData(
    decoded.pixels,
    decoded.width,
    decoded.height,
    p3 ? { colorSpace: 'display-p3' } : undefined,
  )
  const bitmap = await createImageBitmap(data)
  return { width: bitmap.width, height: bitmap.height, p3, bitmap }
}

function canvasOf(width: number, height: number, p3: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', {
    colorSpace: p3 ? 'display-p3' : 'srgb',
    willReadFrequently: false,
  })
  return { canvas, context }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** The size to draw at: the picture's own, or less, to fit `maxPixels`. */
export function fitPixels(width: number, height: number, maxPixels: number) {
  if (width * height <= maxPixels) return { width, height }
  const scale = Math.sqrt(maxPixels / (width * height))
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

async function draw(
  picture: Picture,
  format: ImageFormat,
  width: number,
  height: number,
  p3: boolean,
) {
  const { canvas, context } = canvasOf(width, height, p3)
  if (!context) return undefined
  if (format === 'jpeg') {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, width, height)
  }
  context.imageSmoothingQuality = 'high'
  context.drawImage(picture.bitmap, 0, 0, width, height)
  const blob = await toBlob(canvas, TYPES[format], QUALITY[format])
  if (blob && blob.type === TYPES.jpeg && format === 'jpeg') {
    // Safari adds a little EXIF of its own; only the colour profile stays.
    const { bytes } = cleanJpeg(new Uint8Array(await blob.arrayBuffer()))
    return new Blob([bytes], { type: TYPES.jpeg })
  }
  if (blob && blob.type === TYPES[format]) return blob
  if (blob && format === 'webp') {
    // Safari saves WebP as PNG: the encoder of our own takes over, in sRGB,
    // since it can't carry a colour profile.
    const flat = p3 ? canvasOf(width, height, false) : { canvas, context }
    if (!flat.context) return undefined
    if (p3) flat.context.drawImage(picture.bitmap, 0, 0, width, height)
    const pixels = flat.context.getImageData(0, 0, width, height)
    const { default: encode } = await import('@jsquash/webp/encode')
    const webp = await encode(pixels, { quality: 90 })
    return new Blob([webp], { type: TYPES.webp })
  }
  return undefined
}

export type Saved = {
  blob: Blob
  width: number
  height: number
  smaller: boolean
}

/**
 * The picture as a new file. Saving drops every detail the original had
 * (location, camera, dates), keeping only the colour profile. JPEG has no
 * see-through parts, so they become white. If the browser can't make an
 * image this big (iPhones above about 16.7 megapixels), it's saved at the
 * largest size it can make.
 */
export async function savePicture(
  picture: Picture,
  format: ImageFormat,
): Promise<Saved> {
  const sizes = [
    { width: picture.width, height: picture.height },
    fitPixels(picture.width, picture.height, PHONE_PIXELS),
    fitPixels(picture.width, picture.height, PHONE_PIXELS / 4),
  ]
  for (const size of sizes) {
    if (size !== sizes[0] && size.width >= sizes[0].width) continue
    const blob = await draw(
      picture,
      format,
      size.width,
      size.height,
      picture.p3,
    ).catch(() => undefined)
    if (blob) {
      return {
        blob,
        ...size,
        smaller: size.width < picture.width,
      }
    }
  }
  throw new PictureError('Couldn’t save the image')
}

/**
 * A small JPEG of the picture on white, at most `size` pixels each way,
 * as a data URL.
 */
export function thumbnail(picture: Picture, size: number) {
  const scale = Math.min(1, size / Math.max(picture.width, picture.height))
  const width = Math.max(1, Math.round(picture.width * scale))
  const height = Math.max(1, Math.round(picture.height * scale))
  const { canvas, context } = canvasOf(width, height, false)
  if (!context) return null
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(picture.bitmap, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.8)
}
