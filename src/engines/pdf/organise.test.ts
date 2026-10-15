import { PDFDict, PDFDocument, PDFName, degrees } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { PdfError } from './errors'
import { organisePdf } from './organise'

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

const load = async (bytes: Uint8Array) =>
  PDFDocument.load(bytes, { updateMetadata: false })

const widths = (doc: PDFDocument) =>
  doc.getPages().map((page) => page.getSize().width)

const turns = (doc: PDFDocument) =>
  doc.getPages().map((page) => page.getRotation().angle)

describe('organisePdf', () => {
  it('keeps the pages in the plan, in its order', async () => {
    const file = await makePdf(4)
    const result = await load(
      await organisePdf(file, [
        { index: 3, turn: 0 },
        { index: 0, turn: 0 },
        { index: 2, turn: 0 },
      ]),
    )
    expect(widths(result)).toEqual([400, 100, 300])
  })

  it('turns pages on top of how they were already turned', async () => {
    const file = await makePdf(3, (doc) => {
      doc.getPage(1).setRotation(degrees(90))
      doc.getPage(2).setRotation(degrees(-90))
    })
    const result = await load(
      await organisePdf(file, [
        { index: 0, turn: 90 },
        { index: 1, turn: 270 },
        { index: 2, turn: 180 },
      ]),
    )
    expect(turns(result)).toEqual([90, 0, 90])
  })

  it('leaves the original’s details behind', async () => {
    const file = await makePdf(1, (doc) => {
      doc.setAuthor('Someone Private')
      doc.setTitle('Secret plans')
    })
    const result = await load(await organisePdf(file, [{ index: 0, turn: 0 }]))
    expect(result.getAuthor()).toBeUndefined()
    expect(result.getTitle()).toBeUndefined()
    expect(result.getProducer()).toBe('Tuls')
  })

  it('draws form fields into their pages', async () => {
    const file = await makePdf(1, (doc) => {
      const name = doc.getForm().createTextField('name')
      name.addToPage(doc.getPage(0), { x: 10, y: 10, width: 80, height: 20 })
      name.setText('Ada')
    })
    const result = await load(await organisePdf(file, [{ index: 0, turn: 0 }]))
    const annots = result.getPage(0).node.Annots()
    const widgets = [...Array(annots?.size() ?? 0).keys()].filter(
      (i) =>
        result.context
          .lookupMaybe(annots!.get(i), PDFDict)
          ?.get(PDFName.of('Subtype')) === PDFName.of('Widget'),
    )
    expect(widgets).toEqual([])
  })

  it('says when a file isn’t a PDF', async () => {
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await organisePdf(junk, [{ index: 0, turn: 0 }]).catch(
      (e) => e,
    )
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })

  it('won’t make a PDF with no pages', async () => {
    const error = await organisePdf(await makePdf(2), []).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
  })
})
