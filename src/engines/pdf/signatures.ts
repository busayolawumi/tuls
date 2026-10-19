import { PDFDocument, PDFName, PDFSignature } from '@cantoo/pdf-lib'
import { isSigned } from './names'
import { plainCopy } from './passwords'

/**
 * Whether someone has signed the PDF: a signature field with a signature in
 * it. Any change to the file (a password included) stops it counting.
 *
 * Every signature records the bytes it covers (/ByteRange), so a PDF
 * without one isn't read at all. But Adobe's "usage rights" signatures
 * have one too: they unlock features in old Adobe Readers (IRS forms have
 * them), aren't anyone's signature, and sit in no field, so they don't
 * count here.
 */
export async function hasSignatures(file: ArrayBuffer) {
  if (!isSigned(new Uint8Array(file))) return false
  const doc = await PDFDocument.load(await plainCopy(file), {
    updateMetadata: false,
  })
  return doc
    .getForm()
    .getFields()
    .some(
      (field) =>
        field instanceof PDFSignature &&
        field.acroField.dict.get(PDFName.of('V')) !== undefined,
    )
}
