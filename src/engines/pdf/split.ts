import { PDFDocument } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'
import { flattenForm } from './forms'
import { loadPdf } from './load'

/**
 * Makes one PDF per group of pages (numbered from 0), in order. Like
 * merging, each starts as a fresh PDF, so the original's title, author and
 * other details are left behind, and form fields are drawn into their pages
 * first.
 */
export async function splitPdf(
  file: ArrayBuffer,
  groups: number[][],
): Promise<Uint8Array<ArrayBuffer>[]> {
  try {
    if (groups.length === 0) throw new Error('No parts to make')
    const source = await loadPdf(file)
    flattenForm(source)
    const files: Uint8Array<ArrayBuffer>[] = []
    for (const group of groups) {
      const result = await PDFDocument.create()
      const pages = await result.copyPages(source, group)
      for (const page of pages) result.addPage(page)
      result.setCreator('Tuls')
      result.setProducer('Tuls')
      files.push((await result.save()) as Uint8Array<ArrayBuffer>)
    }
    return files
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
