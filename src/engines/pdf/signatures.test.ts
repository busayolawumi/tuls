import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'
import { hasSignatures } from './signatures'

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer

/** What a signature records: the bytes it covers (made up here). */
const signature = (doc: PDFDocument) =>
  doc.context.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    ByteRange: [0, 100, 200, 50],
  })

/** A one-page PDF, changed by `setUp`, saved with its objects in plain view. */
async function makePdf(setUp: (doc: PDFDocument) => void) {
  const doc = await PDFDocument.create()
  doc.addPage([300, 300])
  setUp(doc)
  return buffer(await doc.save({ useObjectStreams: false }))
}

/** A signature field on the page, signed if `signed`. */
function addSignatureField(doc: PDFDocument, signed: boolean) {
  const { context } = doc
  const page = doc.getPage(0)
  const field = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of('Signature1'),
      Rect: [10, 10, 100, 40],
      P: page.ref,
      ...(signed ? { V: context.register(signature(doc)) } : {}),
    }),
  )
  page.node.set(PDFName.of('Annots'), context.obj([field]))
  doc.catalog.set(
    PDFName.of('AcroForm'),
    context.obj({ Fields: [field], SigFlags: 3 }),
  )
}

describe('hasSignatures', () => {
  it('finds a signed signature field', async () => {
    expect(
      await hasSignatures(await makePdf((doc) => addSignatureField(doc, true))),
    ).toBe(true)
  })

  it('leaves out Adobe’s usage rights, which are no one’s signature', async () => {
    // As in the IRS's forms: a signature in /Perms, in no field.
    const pdf = await makePdf((doc) =>
      doc.catalog.set(
        PDFName.of('Perms'),
        doc.context.obj({ UR3: doc.context.register(signature(doc)) }),
      ),
    )
    expect(await hasSignatures(pdf)).toBe(false)
  })

  it('leaves out a signature field nobody has signed', async () => {
    const pdf = await makePdf((doc) => {
      addSignatureField(doc, false)
      doc.catalog.set(
        PDFName.of('Perms'),
        doc.context.obj({ UR3: doc.context.register(signature(doc)) }),
      )
    })
    expect(await hasSignatures(pdf)).toBe(false)
  })

  it('doesn’t read a PDF with no signature in its bytes', async () => {
    expect(await hasSignatures(await makePdf(() => {}))).toBe(false)
  })
})
