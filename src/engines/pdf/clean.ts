import { PDFDocument, PDFName, PDFRef } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'

/**
 * Removes who made a PDF and with what: its information dictionary (title,
 * author, subject, keywords, dates and anything else) and its XMP metadata.
 * The creator and producer become Tuls. For PDFs made from other documents,
 * which carry over the original's details (Word to PDF).
 *
 * pdf-lib saves every object it read, even ones nothing points to any more,
 * so the old details are deleted outright, not just unlinked.
 */
export async function cleanPdf(file: ArrayBuffer): Promise<Uint8Array> {
  try {
    const doc = await PDFDocument.load(file, { updateMetadata: false })
    const { context } = doc
    const info = context.trailerInfo.Info
    if (info instanceof PDFRef) context.delete(info)
    context.trailerInfo.Info = undefined
    const xmp = doc.catalog.get(PDFName.of('Metadata'))
    if (xmp instanceof PDFRef) context.delete(xmp)
    doc.catalog.delete(PDFName.of('Metadata'))
    doc.setCreator('Tuls')
    doc.setProducer('Tuls')
    return await doc.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
