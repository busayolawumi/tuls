import { PDFDocument } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'
import { flattenForm } from './forms'
import { attachLinks, detachLinks } from './links'
import { loadPdf } from './load'
import {
  keepOutline,
  moveOutline,
  opensWithOutline,
  readOutline,
} from './outline'

/**
 * Makes one PDF per group of pages (numbered from 0), in order. Like
 * merging, each starts as a fresh PDF, so the original's title, author and
 * other details are left behind, and form fields are drawn into their pages
 * first. Each part keeps the bookmarks for its own pages.
 */
export async function splitPdf(
  file: ArrayBuffer,
  groups: number[][],
): Promise<Uint8Array<ArrayBuffer>[]> {
  try {
    if (groups.length === 0) throw new Error('No parts to make')
    const source = await loadPdf(file)
    await flattenForm(source)
    const outline = readOutline(source)
    const links = detachLinks(source)
    const show = opensWithOutline(source)
    const files: Uint8Array<ArrayBuffer>[] = []
    for (const group of groups) {
      const result = await PDFDocument.create()
      const pages = await result.copyPages(source, group)
      for (const page of pages) result.addPage(page)
      const places = new Map(group.map((page, i) => [page, i]))
      attachLinks(
        result,
        links,
        pages.map((page, i) => [group[i], page]),
        (page) => places.get(page),
      )
      keepOutline(
        result,
        moveOutline(outline, (page) => places.get(page)),
        show,
      )
      result.setCreator('Tuls')
      result.setProducer('Tuls')
      files.push((await result.save()) as Uint8Array<ArrayBuffer>)
    }
    return files
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
