import { readPicture, type Reader } from '../../../engines/tesseract/engine'
import {
  fitPixels,
  openPicture,
  PHONE_PIXELS,
  PictureError,
  shrinkPicture,
} from '../../../lib/picture'
import { chooseTurn, DPI, TRY_TURNS } from '../../ocr-pdf/lib/ocr'
import { free, png, turned } from '../../ocr-pdf/lib/read'
import {
  confidentText,
  enlargement,
  FEW_LETTERS,
  isReliable,
  letterCount,
  sureScore,
  tidyText,
} from './text'

/** What was read; no text and `unreadable` when the read was only fragments. */
export type ImageRead = { text: string; turned: boolean; unreadable?: boolean }

const SMALL = 1100

/** An image on white, upright, at most about 16.7 megapixels. */
async function draw(file: File) {
  const opened = await openPicture(file)
  const size = fitPixels(opened.width, opened.height, PHONE_PIXELS)
  const picture =
    size.width < opened.width
      ? await shrinkPicture(opened, size.width, size.height)
      : opened
  const canvas = document.createElement('canvas')
  canvas.width = picture.width
  canvas.height = picture.height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(picture.bitmap, 0, 0, canvas.width, canvas.height)
  opened.bitmap.close()
  if (picture !== opened) picture.bitmap.close()
  return canvas
}

/** Reads a picture as a page, or as scattered text, keeping sure words only. */
async function readWords(reader: Reader, picture: Blob, sparse: boolean) {
  const read = await readPicture(reader, picture, DPI, { sparse, words: true })
  const paragraphs = read.paragraphs ?? []
  return {
    confidence: read.confidence,
    text: tidyText(confidentText(paragraphs)),
    score: sureScore(paragraphs),
    reliable: isReliable(paragraphs),
  }
}

/**
 * A copy for text on colour: each pixel as its brightest channel, so any
 * coloured background turns light while dark text stays dark, and small
 * images enlarged. A logo in dark letters on blue read right only this way.
 */
function contrast(source: HTMLCanvasElement) {
  const scale = enlargement(source.width, source.height)
  const canvas = document.createElement('canvas')
  canvas.width = source.width * scale
  canvas.height = source.height * scale
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.max(pixels[i], pixels[i + 1], pixels[i + 2])
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value
  }
  context.putImageData(image, 0, 0)
  return canvas
}

/**
 * Reads a picture as a page. When that finds little (a logo, a screenshot
 * with text here and there), it also reads it as scattered text, and as a
 * high-contrast copy, and keeps whichever read is worth most.
 */
async function readBest(reader: Reader, canvas: HTMLCanvasElement) {
  const picture = await png(canvas)
  const page = await readWords(reader, picture, false)
  if (letterCount(page.text) >= FEW_LETTERS) return page
  let best = page
  const scattered = await readWords(reader, picture, true)
  if (scattered.score > best.score) best = scattered
  const sharp = contrast(canvas)
  try {
    const clear = await readWords(reader, await png(sharp), true)
    if (clear.score > best.score) best = clear
  } finally {
    free(sharp)
  }
  return best
}

/** Reads one image, trying the other ways up when it reads poorly. */
export async function readImage(
  reader: Reader,
  file: File,
): Promise<ImageRead> {
  const canvas = await draw(file).catch((e: unknown) => {
    throw e instanceof PictureError
      ? e
      : new PictureError('Can’t open', { cause: e })
  })
  try {
    let read = await readBest(reader, canvas)
    let turn = 0
    if (
      read.confidence < TRY_TURNS ||
      letterCount(read.text) === 0 ||
      !read.reliable
    ) {
      const scale = Math.min(1, SMALL / Math.max(canvas.width, canvas.height))
      const scores: number[] = []
      for (const quarter of [0, 1, 2, 3]) {
        const small = turned(canvas, quarter, scale)
        try {
          scores.push(
            (await readPicture(reader, await png(small), DPI)).confidence,
          )
        } finally {
          free(small)
        }
      }
      turn = chooseTurn(scores)
      if (turn) {
        const upright = turned(canvas, turn)
        try {
          const again = await readBest(reader, upright)
          const better =
            again.reliable === read.reliable
              ? letterCount(again.text) > letterCount(read.text)
              : again.reliable
          if (better) read = again
          else turn = 0
        } finally {
          free(upright)
        }
      }
    }
    if (!read.reliable) {
      return { text: '', turned: false, unreadable: letterCount(read.text) > 0 }
    }
    return { text: read.text, turned: turn !== 0 }
  } finally {
    free(canvas)
  }
}

/**
 * Reads the images, each reader taking the next one when it's done.
 * Results come back in the images' order; a failed image gets its error.
 */
export async function readImages(
  files: File[],
  readers: Reader[],
  onImage: () => void,
): Promise<(ImageRead | { error: unknown })[]> {
  const results: (ImageRead | { error: unknown })[] = []
  let next = 0
  let stop: unknown
  await Promise.all(
    readers.map(async (reader) => {
      while (next < files.length && stop === undefined) {
        const index = next++
        try {
          results[index] = await readImage(reader, files[index])
        } catch (e) {
          results[index] = { error: e }
          // A stopped or broken reader can't take more.
          if (!(e instanceof PictureError)) stop = e
        }
        onImage()
      }
    }),
  )
  if (stop !== undefined) throw stop
  return results
}
