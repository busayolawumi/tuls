import { PDFDocument } from '@cantoo/pdf-lib'
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
  it('makes one PDF per group, with that group’s pages', async () => {
    const files = await splitPdf(await makePdf(5), [[0, 1], [2], [3, 4]])
    expect(await Promise.all(files.map(widths))).toEqual([
      [100, 200],
      [300],
      [400, 500],
    ])
  })

  it('leaves the original’s details behind', async () => {
    const file = await makePdf(2, (doc) => {
      doc.setAuthor('Someone Private')
      doc.setTitle('Secret plans')
    })
    for (const bytes of await splitPdf(file, [[0], [1]])) {
      const doc = await PDFDocument.load(bytes, { updateMetadata: false })
      expect(doc.getAuthor()).toBeUndefined()
      expect(doc.getTitle()).toBeUndefined()
      expect(doc.getProducer()).toBe('Tuls')
    }
  })

  it('says when a file isn’t a PDF', async () => {
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await splitPdf(junk, [[0]]).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })

  it('won’t make nothing', async () => {
    expect(await splitPdf(await makePdf(2), []).catch((e) => e)).toBeInstanceOf(
      PdfError,
    )
  })
})
