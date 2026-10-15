import { PDFDocument } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'

/**
 * Puts the pages of several PDFs into one, in the order given. Only pages
 * are copied: titles, authors and other details from the originals are left
 * behind, so the new PDF doesn't carry them.
 */
export async function mergePdfs(files: ArrayBuffer[]): Promise<Uint8Array> {
  try {
    const merged = await PDFDocument.create()
    for (const file of files) {
      const doc = await PDFDocument.load(file)
      const pages = await merged.copyPages(doc, doc.getPageIndices())
      for (const page of pages) merged.addPage(page)
    }
    merged.setCreator('Tuls')
    merged.setProducer('Tuls')
    return await merged.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
