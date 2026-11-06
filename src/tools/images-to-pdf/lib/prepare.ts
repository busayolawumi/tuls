import type { PageImage } from '../../../engines/pdf/images'
import { openPicture } from '../../../lib/picture'
import { formatOf } from './images'

// Images as the browser sees them: thumbnails, and the kinds the PDF can't
// take as they are (WebP, GIF, HEIC and others), redrawn as JPEG or PNG.
// The browser opens what it can, and HEIC photos it can't go to libheif
// (lib/picture.ts).

/** Decodes an image, turned upright as its details say. */
async function decode(file: Blob) {
  return (await openPicture(file)).bitmap
}

/**
 * A small JPEG of the image, upright, at most `size` pixels each way, on
 * white (as it will be on the page). Returns a data URL. Throws if the
 * browser can't open the image.
 */
export async function imagePicture(file: Blob, size: number) {
  const bitmap = await decode(file)
  try {
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')!
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    bitmap.close()
  }
}

/**
 * The image, ready for a page. JPEGs and PNGs are passed on untouched (the
 * PDF engine removes their details). Anything else is redrawn upright, as
 * PNG if any of it is see-through, otherwise as a high-quality JPEG.
 */
export async function pageImage(file: Blob, turn: number): Promise<PageImage> {
  const data = await file.arrayBuffer()
  const format = formatOf(new Uint8Array(data, 0, Math.min(8, data.byteLength)))
  if (format) return { data, format, turn }

  const bitmap = await decode(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let seeThrough = false
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 255) {
        seeThrough = true
        break
      }
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, seeThrough ? 'image/png' : 'image/jpeg', 0.92),
    )
    if (!blob) throw new Error('Couldn’t redraw the image')
    return {
      data: await blob.arrayBuffer(),
      format: seeThrough ? 'png' : 'jpeg',
      turn,
    }
  } finally {
    bitmap.close()
  }
}
