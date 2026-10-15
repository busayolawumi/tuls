import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { PdfError } from './errors'
import { mergePdfs } from './merge'

/** A PDF with `count` blank pages of one size, made on the spot. */
async function makePdf(
  count: number,
  size: [number, number],
  setUp?: (doc: PDFDocument) => void,
) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage(size)
  setUp?.(doc)
  const bytes = await doc.save()
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

const sizes = (doc: PDFDocument) =>
  doc.getPages().map((page) => {
    const { width, height } = page.getSize()
    return `${width}x${height}`
  })

describe('mergePdfs', () => {
  it('puts every page in, in the order given', async () => {
    const a = await makePdf(2, [300, 400])
    const b = await makePdf(3, [500, 500])
    const merged = await PDFDocument.load(await mergePdfs([b, a]))
    expect(sizes(merged)).toEqual([
      '500x500',
      '500x500',
      '500x500',
      '300x400',
      '300x400',
    ])
  })

  it('leaves the originals’ details behind', async () => {
    const a = await makePdf(1, [300, 400], (doc) => {
      doc.setAuthor('Someone Private')
      doc.setTitle('Secret plans')
    })
    const b = await makePdf(1, [300, 400])
    // updateMetadata: false, or pdf-lib stamps its own name on it as it opens.
    const merged = await PDFDocument.load(await mergePdfs([a, b]), {
      updateMetadata: false,
    })
    expect(merged.getAuthor()).toBeUndefined()
    expect(merged.getTitle()).toBeUndefined()
    expect(merged.getProducer()).toBe('Tuls')
  })

  it('says when a file isn’t a PDF', async () => {
    const a = await makePdf(1, [300, 400])
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await mergePdfs([a, junk]).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })

  it('says when a PDF has a password', async () => {
    const locked = await makePdf(1, [300, 400], (doc) =>
      doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' }),
    )
    const error = await mergePdfs([locked]).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('password')
  })
})
