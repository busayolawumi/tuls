import { PDFDocument } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'
import { flattenForm } from './forms'
import { loadPdf } from './load'
import {
  keepOutline,
  opensWithOutline,
  readOutline,
  moveOutline,
  type Bookmark,
} from './outline'

/**
 * Puts the pages of several PDFs into one, in the order given. Only pages
 * and bookmarks are copied: titles, authors and other details from the
 * originals are left behind, so the new PDF doesn't carry them. Form fields
 * are drawn into their pages first, so filled-in answers are kept. Each
 * PDF's bookmarks follow the last one's.
 */
export async function mergePdfs(files: ArrayBuffer[]): Promise<Uint8Array> {
  try {
    const merged = await PDFDocument.create()
    const outline: Bookmark[] = []
    let show = false
    for (const file of files) {
      const doc = await loadPdf(file)
      await flattenForm(doc)
      const start = merged.getPageCount()
      outline.push(...moveOutline(readOutline(doc), (page) => start + page))
      show ||= opensWithOutline(doc)
      const pages = await merged.copyPages(doc, doc.getPageIndices())
      for (const page of pages) merged.addPage(page)
    }
    keepOutline(merged, outline, show)
    merged.setCreator('Tuls')
    merged.setProducer('Tuls')
    return await merged.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
