import { hasSignaturesInBackground } from '../../engines/pdf/client'
import { pdfErrorKind } from '../../engines/pdf/errors'
import { isSigned } from '../../engines/pdf/names'
import { closePdf, openPdf, pagePicture } from '../../engines/pdf/pdfjs'

// A first look at a PDF with pdf.js, for the password tools: whether it
// needs a password to open, and if not, its pages, a picture of its first
// page and whether someone has signed it. A damaged file throws, as pdf.js
// does (see engines/pdf/errors.ts).

export type Look =
  | { locked: true }
  | {
      locked: false
      pages: number
      picture: string | null
      signed: boolean
    }

// Big enough for a result's preview; lists use smaller.
const PICTURE_SIZE = 600

export async function lookAtPdf(data: ArrayBuffer): Promise<Look> {
  let doc
  try {
    doc = await openPdf(data)
  } catch (e) {
    if (pdfErrorKind(e) === 'password') return { locked: true }
    throw e
  }
  try {
    const picture = await pagePicture(doc, 1, PICTURE_SIZE, PICTURE_SIZE).catch(
      () => null,
    )
    return {
      locked: false,
      pages: doc.numPages,
      picture,
      // Most PDFs have no sign of a signature in their bytes, and aren't
      // read again; the rest are checked properly in the PDF worker.
      signed:
        isSigned(new Uint8Array(data)) &&
        (await hasSignaturesInBackground(data.slice(0)).catch(() => false)),
    }
  } finally {
    await closePdf(doc)
  }
}
