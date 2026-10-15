import {
  concatTransformationMatrix,
  drawObject,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib'
import { cleanJpeg } from '../../lib/jpeg'
import { PdfError, pdfErrorKind } from './errors'

/** An image for a page: JPEG or PNG, and how far to turn it clockwise. */
export type PageImage = {
  data: ArrayBuffer
  format: 'jpeg' | 'png'
  turn: number
}

/** A4 or Letter, each page turned to suit its image, or the image's size. */
export type PageSize = 'a4' | 'letter' | 'fit'

// Paper sizes in points (1/72 inch), portrait.
const PAPER = { a4: [595.28, 841.89], letter: [612, 792] } as const
// About 8 mm of white around each image on paper sizes.
const MARGIN = 24
// Pixels to points at 96 per inch, so pictures come out at their size on
// screen. They're never made bigger than that, so small ones stay sharp.
const PX = 0.75

/**
 * Where an image's corners go: (u, v) in the image (0 to 1, from the
 * bottom left) to (s, t) on its box, as s = a·u + b·v + c and
 * t = d·u + e·v + f.
 */
export type Placing = [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
]

const STRAIGHT: Placing = [1, 0, 0, 0, 1, 0]
const MIRROR: Placing = [-1, 0, 1, 0, 1, 0]
// A quarter turn clockwise: the top left corner goes to the top right.
const QUARTER: Placing = [0, 1, 0, -1, 0, 1]

/** `first`, then `then`. */
function compose(first: Placing, then: Placing): Placing {
  const [a, b, c, d, e, f] = first
  const [A, B, C, D, E, F] = then
  return [
    A * a + B * d,
    A * b + B * e,
    A * c + B * f + C,
    D * a + E * d,
    D * b + E * e,
    D * c + E * f + F,
  ]
}

// What each EXIF orientation asks for, to show the picture upright: a
// mirror (left to right), then some quarter turns clockwise.
const ORIENTATIONS: Record<number, [mirror: boolean, quarters: number]> = {
  1: [false, 0],
  2: [true, 0],
  3: [false, 2],
  4: [true, 2],
  5: [true, 3],
  6: [false, 1],
  7: [true, 1],
  8: [false, 3],
}

/**
 * How to draw a picture upright and then turned `turn` degrees clockwise:
 * where its corners go, and whether its width and height swap.
 */
export function orient(orientation: number, turn: number) {
  const [mirror, quarters] = ORIENTATIONS[orientation] ?? ORIENTATIONS[1]
  const turns = quarters + Math.round(turn / 90)
  let placing = mirror ? MIRROR : STRAIGHT
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
    placing = compose(placing, QUARTER)
  }
  return { placing, swaps: turns % 2 !== 0 }
}

/**
 * A page for a picture `width` × `height` pixels (as shown), and the box on
 * it the picture fills: centred, as large as fits, never past its own size.
 */
export function layout(width: number, height: number, size: PageSize) {
  if (size === 'fit') {
    const page = [width * PX, height * PX] as const
    return { page, box: { x: 0, y: 0, width: page[0], height: page[1] } }
  }
  const [short, long] = PAPER[size]
  const page = (width > height ? [long, short] : [short, long]) as [
    number,
    number,
  ]
  const scale = Math.min(
    (page[0] - 2 * MARGIN) / width,
    (page[1] - 2 * MARGIN) / height,
    PX,
  )
  const box = { width: width * scale, height: height * scale }
  return {
    page,
    box: {
      ...box,
      x: (page[0] - box.width) / 2,
      y: (page[1] - box.height) / 2,
    },
  }
}

/**
 * Makes a PDF with one image per page, in order. JPEGs go in as they are,
 * so they don't lose quality, but without their personal details (camera,
 * date, location), and turned upright as their EXIF says.
 */
export async function imagesToPdf(
  images: PageImage[],
  size: PageSize,
): Promise<Uint8Array> {
  try {
    if (images.length === 0) throw new Error('No images')
    const doc = await PDFDocument.create()
    for (const image of images) {
      let orientation = 1
      let embedded
      if (image.format === 'jpeg') {
        const clean = cleanJpeg(new Uint8Array(image.data))
        orientation = clean.orientation
        embedded = await doc.embedJpg(clean.bytes)
      } else {
        // pdf-lib reads a PNG's pixels and stores them afresh, so any text
        // the PNG carried is left behind.
        embedded = await doc.embedPng(new Uint8Array(image.data))
      }
      const { placing, swaps } = orient(orientation, image.turn)
      const [width, height] = swaps
        ? [embedded.height, embedded.width]
        : [embedded.width, embedded.height]
      const { page: pageSize, box } = layout(width, height, size)
      const page = doc.addPage([pageSize[0], pageSize[1]])
      // Images are drawn into a 1 × 1 square, so this matrix places, turns
      // and mirrors it in one go.
      const [a, b, c, d, e, f] = placing
      page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          box.width * a,
          box.height * d,
          box.width * b,
          box.height * e,
          box.x + box.width * c,
          box.y + box.height * f,
        ),
        drawObject(page.node.newXObject('Image', embedded.ref)),
        popGraphicsState(),
      )
    }
    doc.setCreator('Tuls')
    doc.setProducer('Tuls')
    return await doc.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
