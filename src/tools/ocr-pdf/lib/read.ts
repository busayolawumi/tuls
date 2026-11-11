import type { PDFDocumentProxy } from 'pdfjs-dist'
import { closePdf, openPdf } from '../../../engines/pdf/pdfjs'
import { imageScale } from '../../../engines/pdf/scale'
import type { TextLayer } from '../../../engines/pdf/textLayers'
import { readPicture, type Reader } from '../../../engines/tesseract/engine'
import { chooseTurn, DPI, hasReadableText, TRY_TURNS } from './ocr'

/** A page read: its text to lay over it, if any was found. */
export type PageOutcome = Omit<TextLayer, 'layer'> & { layer?: ArrayBuffer }

// The other ways up are tried on a copy this many pixels across.
const SMALL = 1100

async function draw(doc: PDFDocumentProxy, number: number) {
  const page = await doc.getPage(number)
  try {
    const base = page.getViewport({ scale: 1 })
    // Whole dots per inch, so the text's page comes out the page's size.
    const dpi = Math.floor(imageScale(base.width, base.height, DPI) * 72)
    const viewport = page.getViewport({ scale: dpi / 72 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: 'white' }).promise
    return { canvas, dpi }
  } finally {
    page.cleanup()
  }
}

/** A copy turned `turn` quarter turns clockwise, and scaled. */
function turned(source: HTMLCanvasElement, turn: number, scale = 1) {
  const width = Math.round(source.width * scale)
  const height = Math.round(source.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = turn % 2 ? height : width
  canvas.height = turn % 2 ? width : height
  const context = canvas.getContext('2d')!
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((turn * Math.PI) / 2)
  context.drawImage(source, -width / 2, -height / 2, width, height)
  return canvas
}

const png = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Couldn’t draw the page')),
      'image/png',
    ),
  )

// Safari is slow to let a canvas's memory go by itself.
const free = (canvas: HTMLCanvasElement) => {
  canvas.width = canvas.height = 0
}

async function readPage(
  reader: Reader,
  doc: PDFDocumentProxy,
  number: number,
): Promise<PageOutcome> {
  const { canvas, dpi } = await draw(doc, number)
  try {
    let read = await readPicture(reader, await png(canvas), dpi, true)
    let turn = 0
    if (read.confidence < TRY_TURNS) {
      const scale = Math.min(1, SMALL / Math.max(canvas.width, canvas.height))
      const scores: number[] = []
      for (const quarter of [0, 1, 2, 3]) {
        const small = turned(canvas, quarter, scale)
        try {
          const quick = await readPicture(
            reader,
            await png(small),
            Math.max(1, Math.round(dpi * scale)),
            false,
          )
          scores.push(quick.confidence)
        } finally {
          free(small)
        }
      }
      turn = chooseTurn(scores)
      if (turn) {
        const upright = turned(canvas, turn)
        try {
          read = await readPicture(reader, await png(upright), dpi, true)
        } finally {
          free(upright)
        }
      }
    }
    return hasReadableText(read)
      ? { page: number, turn, layer: read.layer?.buffer }
      : { page: number, turn: 0 }
  } finally {
    free(canvas)
  }
}

/**
 * Reads `pages` (numbered from 1) of a PDF, each reader taking the next
 * page when it's done. `onPage` hears each page finish.
 */
export async function readPages(
  pdf: ArrayBuffer,
  pages: number[],
  readers: Reader[],
  onPage: () => void,
) {
  const doc = await openPdf(pdf)
  const queue = [...pages]
  const done: PageOutcome[] = []
  try {
    const lanes = await Promise.allSettled(
      readers.map(async (reader) => {
        try {
          for (let next = queue.shift(); next; next = queue.shift()) {
            done.push(await readPage(reader, doc, next))
            onPage()
          }
        } catch (e) {
          // The other readers stop after their current page.
          queue.length = 0
          throw e
        }
      }),
    )
    const failed = lanes.find((lane) => lane.status === 'rejected')
    if (failed) throw failed.reason
  } finally {
    await closePdf(doc)
  }
  return done.sort((a, b) => a.page - b.page)
}
