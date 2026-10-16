import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { cleanPdf } from './clean'
import { PdfError } from './errors'

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer

/** A PDF full of details, as a word processor would write it. */
async function detailedPdf() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  doc.setTitle('Salary review')
  doc.setAuthor('Ada Example')
  doc.setSubject('Private')
  doc.setKeywords(['pay', 'Ada Example'])
  doc.setCreator('Writer')
  doc.setProducer('LibreOffice 24.8')
  const xmp = doc.context.stream(
    '<x:xmpmeta><dc:creator>Ada Example</dc:creator></x:xmpmeta>',
    { Type: 'Metadata', Subtype: 'XML' },
  )
  doc.catalog.set(PDFName.of('Metadata'), doc.context.register(xmp))
  return buffer(await doc.save())
}

/** Every object in a PDF, as text, to search for leftovers. */
function allText(doc: PDFDocument) {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) =>
      object instanceof PDFRawStream
        ? Buffer.from(object.contents).toString('latin1')
        : object.toString(),
    )
    .join('\n')
}

describe('cleanPdf', () => {
  it('removes the title, author and the rest, and says Tuls made it', async () => {
    const before = await PDFDocument.load(await detailedPdf())
    expect(allText(before)).toContain('Ada Example')

    const doc = await PDFDocument.load(await cleanPdf(await detailedPdf()), {
      updateMetadata: false,
    })
    expect(doc.getTitle()).toBeUndefined()
    expect(doc.getAuthor()).toBeUndefined()
    expect(doc.getSubject()).toBeUndefined()
    expect(doc.getKeywords()).toBeUndefined()
    expect(doc.getCreator()).toBe('Tuls')
    expect(doc.getProducer()).toBe('Tuls')
    expect(doc.catalog.get(PDFName.of('Metadata'))).toBeUndefined()
    expect(allText(doc)).not.toContain('Ada Example')
    expect(allText(doc)).not.toContain('LibreOffice')
    expect(doc.getPageCount()).toBe(1)
  })

  it('copes with a PDF that has no details at all', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bare = buffer(await doc.save({ updateFieldAppearances: false }))
    const cleaned = await PDFDocument.load(await cleanPdf(bare), {
      updateMetadata: false,
    })
    expect(cleaned.getProducer()).toBe('Tuls')
  })

  it('fails plainly for something that isn’t a PDF', async () => {
    await expect(
      cleanPdf(new TextEncoder().encode('not a pdf').buffer),
    ).rejects.toBeInstanceOf(PdfError)
  })
})
