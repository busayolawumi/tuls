import { readFileSync } from 'node:fs'
import {
  degrees,
  PDFDocument,
  StandardFonts,
  TextRenderingMode,
} from '@cantoo/pdf-lib'
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { addTextLayers } from './textLayers'

// The real qpdf, with layers made the way Tesseract makes them: one page the
// size of the page as shown, with invisible text. pdf.js reads back where
// each word ends up on the page as shown, top-left origin.

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer

type PageSpec = {
  rotate?: number
  crop?: [number, number, number, number]
  /** Visible words, at points on the page before any rotation. */
  words?: [string, number, number][]
}

async function pdf(pages: PageSpec[], details = false) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const { rotate = 0, crop, words = [] } of pages) {
    const page = doc.addPage([600, 800])
    if (crop) page.setCropBox(...crop)
    page.setRotation(degrees(rotate))
    for (const [text, x, y] of words)
      page.drawText(text, { x, y, size: 20, font })
  }
  if (details) {
    doc.setTitle('Scanned contract')
    doc.setAuthor('Ada Example')
  }
  return buffer(await doc.save())
}

/** An invisible-text page, `width` × `height`, with `text` at (x, y) from top left. */
async function layer(
  width: number,
  height: number,
  text: string,
  x: number,
  y: number,
) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([width, height]).drawText(text, {
    x,
    y: height - y,
    size: 20,
    font,
    renderMode: TextRenderingMode.Invisible,
  })
  return buffer(await doc.save())
}

/** Each page as shown: its size, rotation and words, with where they start. */
async function shown(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const view = page.getViewport({ scale: 1 })
    const items = (await page.getTextContent()).items as {
      str: string
      transform: number[]
    }[]
    pages.push({
      size: [view.width, view.height],
      rotate: page.rotate,
      words: Object.fromEntries(
        items
          .filter((item) => item.str.trim())
          .map((item) => {
            const at = Util.transform(view.transform, item.transform)
            return [item.str, [Math.round(at[4]), Math.round(at[5])]]
          }),
      ),
    })
  }
  const { info, metadata } = await doc.getMetadata()
  return { pages, info: info as Record<string, unknown>, metadata }
}

describe('laying recognised text over pages', () => {
  it('puts each word where the page shows it, rotated or cropped', async () => {
    const original = await pdf([
      {},
      { rotate: 90 },
      { rotate: 180 },
      { rotate: 270 },
      { crop: [50, 100, 500, 600] },
      { rotate: 90, crop: [50, 100, 500, 600] },
    ])
    const before = await shown(new Uint8Array(original))
    const layers = await Promise.all(
      before.pages.map(async ({ size: [w, h] }, i) => ({
        page: i + 1,
        turn: 0,
        layer: await layer(w, h, `Word${i + 1}`, 40, 60),
      })),
    )
    const after = await shown(await addTextLayers(original, layers))
    for (const [i, page] of after.pages.entries()) {
      expect(page.size, `page ${i + 1}`).toEqual(before.pages[i].size)
      expect(page.words, `page ${i + 1}`).toEqual({
        [`Word${i + 1}`]: [40, 60],
      })
    }
  })

  it('turns sideways pages upright first, and lays the text over them as shown', async () => {
    const original = await pdf([{}, {}, { rotate: 90 }, {}])
    const layers = [
      { page: 2, turn: 1, layer: await layer(800, 600, 'Quarter', 30, 50) },
      { page: 3, turn: 2, layer: await layer(800, 600, 'Half', 30, 50) },
      { page: 4, turn: 3, layer: await layer(800, 600, 'Back', 30, 50) },
    ]
    const { pages } = await shown(await addTextLayers(original, layers))
    expect(pages.map((page) => page.rotate)).toEqual([0, 90, 270, 270])
    expect(pages[1]).toMatchObject({
      size: [800, 600],
      words: { Quarter: [30, 50] },
    })
    expect(pages[2]).toMatchObject({
      size: [800, 600],
      words: { Half: [30, 50] },
    })
    expect(pages[3]).toMatchObject({
      size: [800, 600],
      words: { Back: [30, 50] },
    })
    expect(pages[0].words).toEqual({})
  })

  it('keeps the page’s own text and pictures, and removes the PDF’s details', async () => {
    const original = await pdf([{ words: [['Printed', 100, 700]] }], true)
    const out = await addTextLayers(original, [
      { page: 1, turn: 0, layer: await layer(600, 800, 'Scanned', 100, 200) },
    ])
    const { pages, info, metadata } = await shown(out)
    expect(Object.keys(pages[0].words).sort()).toEqual(['Printed', 'Scanned'])
    expect(info.Title).toBeUndefined()
    expect(info.Author).toBeUndefined()
    expect(metadata).toBeNull()
    expect(Buffer.from(out).toString('latin1')).not.toContain('Ada Example')
  })

  it('takes the lock off a PDF locked only against changes', async () => {
    const locked = readFileSync(
      new URL('./fixtures/change-locked-by-apple.pdf', import.meta.url),
    )
    const before = await shown(new Uint8Array(locked))
    const [w, h] = before.pages[0].size
    const out = await addTextLayers(buffer(locked), [
      { page: 1, turn: 0, layer: await layer(w, h, 'Added', 10, 30) },
    ])
    expect(Buffer.from(out).toString('latin1')).not.toContain('/Encrypt')
    expect((await shown(out)).pages[0].words.Added).toEqual([10, 30])
  })

  it('handles a layer on every page of a long PDF', async () => {
    const original = await pdf(Array.from({ length: 120 }, () => ({})))
    const layers = await Promise.all(
      Array.from({ length: 120 }, async (_, i) => ({
        page: i + 1,
        turn: i % 7 === 0 ? 1 : 0,
        layer: await layer(
          i % 7 === 0 ? 800 : 600,
          i % 7 === 0 ? 600 : 800,
          `P${i + 1}`,
          20,
          40,
        ),
      })),
    )
    const { pages } = await shown(await addTextLayers(original, layers))
    expect(pages).toHaveLength(120)
    expect(
      pages.every((page, i) => page.words[`P${i + 1}`]?.join() === '20,40'),
    ).toBe(true)
  })
})
