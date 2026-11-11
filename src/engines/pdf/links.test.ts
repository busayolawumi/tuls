import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
  type PDFObject,
  type PDFRef,
} from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { mergePdfs } from './merge'
import { organisePdf } from './organise'
import { splitPdf } from './split'

type Link = (pages: PDFRef[], doc: PDFDocument) => [string, PDFObject]

const toPage =
  (n: number): Link =>
  (pages, doc) => ['Dest', doc.context.obj([pages[n], 'XYZ', 0, 400, null])]

/** A PDF with `count` pages, and links given per page. */
async function makePdf(
  count: number,
  links: Record<number, Link[]>,
  setUp?: (doc: PDFDocument, pages: PDFRef[]) => void,
) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage([(i + 1) * 100, 500])
  const pages = doc.getPages().map((page) => page.ref)
  const { context } = doc
  for (const [index, list] of Object.entries(links)) {
    const annots = list.map((link, i) => {
      const dict = context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [10, 10 + i * 20, 90, 25 + i * 20],
      }) as PDFDict
      const [key, value] = link(pages, doc)
      dict.set(PDFName.of(key), value)
      return context.register(dict)
    })
    const note = context.register(
      context.obj({
        Type: 'Annot',
        Subtype: 'Text',
        Rect: [0, 0, 10, 10],
        Contents: PDFString.of('note'),
      }),
    )
    doc
      .getPage(Number(index))
      .node.set(PDFName.of('Annots'), context.obj([...annots, note]))
  }
  setUp?.(doc, pages)
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** Each link as [its page, the page it goes to], from 1, as pdf.js reads them. */
async function links(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  const found: [number, number | null][] = []
  let notes = 0
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      for (const annot of await (await doc.getPage(p)).getAnnotations()) {
        if (annot.subtype === 'Text') notes++
        if (annot.subtype !== 'Link' || annot.url) continue
        let dest = annot.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        found.push([
          p,
          Array.isArray(dest) ? (await doc.getPageIndex(dest[0])) + 1 : null,
        ])
      }
    }
  } finally {
    await doc.loadingTask.destroy()
  }
  return { found, notes }
}

/** How many page objects a PDF holds, in its page tree or not. */
async function pageObjects(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  let count = 0
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFDict &&
      object.get(PDFName.of('Type')) === PDFName.of('Page')
    )
      count++
  }
  return count
}

describe('links to pages within a PDF', () => {
  it('go to the right pages after merging, without copying extra pages', async () => {
    const a = await makePdf(2, { 0: [toPage(1)] })
    const b = await makePdf(3, { 2: [toPage(0)], 0: [toPage(2)] })
    const merged = await mergePdfs([a, b])
    expect((await links(merged)).found).toEqual([
      [1, 2],
      [3, 5],
      [5, 3],
    ])
    expect(await pageObjects(merged)).toBe(5)
  })

  it('follow named places and GoTo actions', async () => {
    const pdf = await makePdf(
      3,
      {
        0: [
          () => ['Dest', PDFString.of('end')],
          (pages, doc) => [
            'A',
            doc.context.obj({ S: 'GoTo', D: [pages[1], 'Fit'] }),
          ],
        ],
      },
      (doc, pages) => {
        const dests = doc.context.obj({
          Names: [PDFString.of('end'), doc.context.obj([pages[2], 'Fit'])],
        })
        doc.catalog.set(PDFName.of('Names'), doc.context.obj({ Dests: dests }))
      },
    )
    expect((await links(await mergePdfs([pdf]))).found).toEqual([
      [1, 3],
      [1, 2],
    ])
  })

  it('follow their pages when organising, and go with deleted ones', async () => {
    const pdf = await makePdf(3, { 0: [toPage(2), toPage(1)] })
    const plan = [2, 0].map((index) => ({ index, turn: 90 }))
    const { found, notes } = await links(await organisePdf(pdf, plan))
    expect(found).toEqual([[2, 1]])
    expect(notes).toBe(1)
  })

  it('stay within each part when splitting', async () => {
    const pdf = await makePdf(4, { 0: [toPage(1), toPage(3)], 3: [toPage(2)] })
    const [first, second] = await splitPdf(pdf, [
      [0, 1],
      [2, 3],
    ])
    expect((await links(first)).found).toEqual([[1, 2]])
    expect((await links(second)).found).toEqual([[2, 1]])
    expect(await pageObjects(first)).toBe(2)
  })
})
