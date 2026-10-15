import { PDFDocument } from '@cantoo/pdf-lib'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { PdfError } from './errors'
import { splitPdf } from './split'

/** A PDF whose pages are told apart by their widths: 100, 200, 300… */
async function makePdf(count: number, setUp?: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage([(i + 1) * 100, 500])
  setUp?.(doc)
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

const widths = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((page) => page.getSize().width)

describe('splitPdf', () => {
  it('makes one PDF per part, with that part’s pages', async () => {
    const { files } = await splitPdf(await makePdf(5), [
      { name: 'a-pages-1-2.pdf', pages: [0, 1] },
      { name: 'a-page-3.pdf', pages: [2] },
      { name: 'a-pages-4-5.pdf', pages: [3, 4] },
    ])
    expect(await Promise.all(files.map(widths))).toEqual([
      [100, 200],
      [300],
      [400, 500],
    ])
  })

  it('also puts them all in a ZIP, by name', async () => {
    const { files, zip } = await splitPdf(await makePdf(2), [
      { name: 'a-page-1.pdf', pages: [0] },
      { name: 'a-page-2.pdf', pages: [1] },
    ])
    const unzipped = unzipSync(zip!)
    expect(Object.keys(unzipped)).toEqual(['a-page-1.pdf', 'a-page-2.pdf'])
    expect(unzipped['a-page-2.pdf']).toEqual(files[1])
  })

  it('makes no ZIP for a single part', async () => {
    const { files, zip } = await splitPdf(await makePdf(2), [
      { name: 'a.pdf', pages: [0, 1] },
    ])
    expect(files).toHaveLength(1)
    expect(zip).toBeUndefined()
  })

  it('leaves the original’s details behind', async () => {
    const file = await makePdf(2, (doc) => {
      doc.setAuthor('Someone Private')
      doc.setTitle('Secret plans')
    })
    const { files } = await splitPdf(file, [
      { name: 'a.pdf', pages: [0] },
      { name: 'b.pdf', pages: [1] },
    ])
    for (const bytes of files) {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false })
      expect(doc.getAuthor()).toBeUndefined()
      expect(doc.getTitle()).toBeUndefined()
      expect(doc.getProducer()).toBe('Tuls')
    }
  })

  it('says when a file isn’t a PDF', async () => {
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await splitPdf(junk, [{ name: 'a.pdf', pages: [0] }]).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })
})
