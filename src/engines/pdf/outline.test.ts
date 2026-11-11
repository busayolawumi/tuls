import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFObject,
} from '@cantoo/pdf-lib'
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { mergePdfs } from './merge'
import { organisePdf } from './organise'
import { readOutline } from './outline'
import { splitPdf } from './split'

type Spec = {
  title: string
  /** Where it goes, given the PDF's page refs. */
  to?: (pages: PDFRef[], doc: PDFDocument) => [string, PDFObject]
  open?: boolean
  children?: Spec[]
}

const page = (n: number) => (pages: PDFRef[], doc: PDFDocument) =>
  ['Dest', doc.context.obj([pages[n], 'XYZ', 0, 500, null])] as [
    string,
    PDFObject,
  ]

/** A PDF with `count` pages and the bookmarks given, written by hand. */
async function makePdf(
  count: number,
  bookmarks: Spec[],
  setUp?: (doc: PDFDocument, pages: PDFRef[]) => void,
) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage([(i + 1) * 100, 500])
  const pages = doc.getPages().map((p) => p.ref)
  const { context } = doc
  const level = (list: Spec[], parent: PDFRef): PDFRef[] => {
    const refs = list.map(() => context.nextRef())
    list.forEach((spec, i) => {
      const dict = context.obj({}) as PDFDict
      dict.set(PDFName.of('Title'), PDFHexString.fromText(spec.title))
      dict.set(PDFName.of('Parent'), parent)
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1])
      if (spec.to) {
        const [key, value] = spec.to(pages, doc)
        dict.set(PDFName.of(key), value)
      }
      if (spec.children?.length) {
        const kids = level(spec.children, refs[i])
        dict.set(PDFName.of('First'), kids[0])
        dict.set(PDFName.of('Last'), kids[kids.length - 1])
        const n = spec.children.length
        dict.set(PDFName.of('Count'), PDFNumber.of(spec.open ? n : -n))
      }
      context.assign(refs[i], dict)
    })
    return refs
  }
  const root = context.nextRef()
  const top = level(bookmarks, root)
  context.assign(
    root,
    context.obj({ Type: 'Outlines', First: top[0], Last: top.at(-1)! }),
  )
  doc.catalog.set(PDFName.of('Outlines'), root)
  setUp?.(doc, pages)
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

type Seen = { title: string; page?: number; url?: string; items?: Seen[] }

/** The bookmarks as pdf.js reads them, with page numbers from 1. */
async function bookmarks(bytes: Uint8Array): Promise<Seen[]> {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  type Item = {
    title: string
    dest: string | unknown[] | null
    url: string | null
    items: Item[]
  }
  const walk = async (items: Item[] | null): Promise<Seen[]> =>
    Promise.all(
      (items ?? []).map(async (item) => {
        let dest = item.dest
        if (typeof dest === 'string') dest = await doc.getDestination(dest)
        const seen: Seen = { title: item.title }
        if (Array.isArray(dest)) {
          seen.page = (await doc.getPageIndex(dest[0] as never)) + 1
        }
        if (item.url) seen.url = item.url
        if (item.items.length) seen.items = await walk(item.items)
        return seen
      }),
    )
  try {
    return await walk((await doc.getOutline()) as Item[] | null)
  } finally {
    await doc.loadingTask.destroy()
  }
}

describe('bookmarks', () => {
  it('follow each PDF’s pages when merging', async () => {
    const a = await makePdf(2, [
      { title: 'A one', to: page(0) },
      { title: 'A two', to: page(1) },
    ])
    const b = await makePdf(3, [
      {
        title: 'B',
        to: page(0),
        open: true,
        children: [{ title: 'B three', to: page(2) }],
      },
    ])
    const plain = await makePdf(1, [])
    expect(await bookmarks(await mergePdfs([a, plain, b]))).toEqual([
      { title: 'A one', page: 1 },
      { title: 'A two', page: 2 },
      { title: 'B', page: 4, items: [{ title: 'B three', page: 6 }] },
    ])
  })

  it('go to named places, and through GoTo actions', async () => {
    const pdf = await makePdf(
      3,
      [
        { title: 'Tree', to: () => ['Dest', PDFString.of('sec.2')] },
        { title: 'Old', to: () => ['Dest', PDFName.of('third')] },
        {
          title: 'Action',
          to: (pages, doc) => [
            'A',
            doc.context.obj({ S: 'GoTo', D: [pages[1], 'Fit'] }),
          ],
        },
      ],
      (doc, pages) => {
        const { context, catalog } = doc
        const dests = context.obj({
          Names: [PDFString.of('sec.2'), context.obj({ D: [pages[1], 'Fit'] })],
        })
        catalog.set(PDFName.of('Names'), context.obj({ Dests: dests }))
        catalog.set(
          PDFName.of('Dests'),
          context.obj({ third: [pages[2], 'XYZ', null, null, null] }),
        )
      },
    )
    expect(await bookmarks(await mergePdfs([pdf]))).toEqual([
      { title: 'Tree', page: 2 },
      { title: 'Old', page: 3 },
      { title: 'Action', page: 2 },
    ])
  })

  it('keep titles in any language, and web addresses', async () => {
    const pdf = await makePdf(1, [
      { title: 'Ọlá (draft) \\ 日本', to: page(0) },
      {
        title: 'Site',
        to: (_, doc) => [
          'A',
          doc.context.obj({
            S: 'URI',
            URI: PDFString.of('https://example.com/a\\)b'),
          }),
        ],
      },
      {
        title: 'Script',
        to: (_, doc) => [
          'A',
          doc.context.obj({ S: 'JavaScript', JS: PDFString.of('x') }),
        ],
      },
    ])
    expect(await bookmarks(await mergePdfs([pdf]))).toEqual([
      { title: 'Ọlá (draft) \\ 日本', page: 1 },
      { title: 'Site', url: 'https://example.com/a)b' },
    ])
  })

  it('keep which ones are open', async () => {
    const pdf = await makePdf(3, [
      {
        title: 'Open',
        to: page(0),
        open: true,
        children: [{ title: 'a', to: page(1) }],
      },
      {
        title: 'Closed',
        to: page(1),
        children: [
          { title: 'b', to: page(1) },
          { title: 'c', to: page(2) },
        ],
      },
    ])
    const doc = await PDFDocument.load(await mergePdfs([pdf]))
    const counts = readOutline(doc).map((item) => item.open)
    expect(counts).toEqual([true, false])
    const root = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict)
    expect(root.lookup(PDFName.of('Count'), PDFNumber).asNumber()).toBe(3)
  })

  it('move with their pages when organising, and go when their page does', async () => {
    const pdf = await makePdf(4, [
      { title: 'One', to: page(0) },
      {
        title: 'Two',
        to: page(1),
        children: [
          { title: 'Two a', to: page(1) },
          { title: 'Three', to: page(2) },
        ],
      },
      { title: 'Four', to: page(3) },
    ])
    const plan = [3, 0, 2].map((index) => ({ index, turn: 90 }))
    expect(await bookmarks(await organisePdf(pdf, plan))).toEqual([
      { title: 'One', page: 2 },
      { title: 'Two', page: 3, items: [{ title: 'Three', page: 3 }] },
      { title: 'Four', page: 1 },
    ])
  })

  it('go with their pages when splitting', async () => {
    const pdf = await makePdf(4, [
      { title: 'One', to: page(0) },
      {
        title: 'Part',
        to: page(1),
        children: [{ title: 'Four', to: page(3) }],
      },
    ])
    const [first, second] = await splitPdf(pdf, [
      [0, 1],
      [2, 3],
    ])
    expect(await bookmarks(first)).toEqual([
      { title: 'One', page: 1 },
      { title: 'Part', page: 2 },
    ])
    expect(await bookmarks(second)).toEqual([
      { title: 'Part', page: 2, items: [{ title: 'Four', page: 2 }] },
    ])
  })

  it('come through PDFs locked against changes by Apple’s apps', async () => {
    const bytes = readFileSync(
      new URL('fixtures/change-locked-by-apple.pdf', import.meta.url),
    )
    const pdf = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer
    expect(await bookmarks(await mergePdfs([pdf]))).toEqual([
      { title: 'Step 1) Start', page: 1 },
    ])
  })

  it('keep a PDF opening with its bookmarks showing', async () => {
    const pdf = await makePdf(1, [{ title: 'One', to: page(0) }], (doc) =>
      doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines')),
    )
    const doc = await PDFDocument.load(await mergePdfs([pdf]))
    expect(doc.catalog.get(PDFName.of('PageMode'))).toBe(
      PDFName.of('UseOutlines'),
    )
  })

  it('don’t stop a merge when they loop', async () => {
    const pdf = await makePdf(
      2,
      [
        { title: 'One', to: page(0) },
        { title: 'Two', to: page(1) },
      ],
      (doc) => {
        const root = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict)
        const last = root.get(PDFName.of('Last')) as PDFRef
        const first = root.get(PDFName.of('First')) as PDFRef
        doc.context.lookup(last, PDFDict).set(PDFName.of('Next'), first)
        doc.context.lookup(first, PDFDict).set(PDFName.of('First'), first)
      },
    )
    const merged = await mergePdfs([pdf])
    expect((await bookmarks(merged)).map((item) => item.title)).toEqual([
      'One',
      'Two',
    ])
    const doc = await PDFDocument.load(merged)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.catalog.lookup(PDFName.of('Outlines'))).toBeInstanceOf(PDFDict)
  })
})
