import { PDFDocument, degrees } from '@cantoo/pdf-lib'
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

/** A page of the new PDF: which original page (from 0), and how far to turn it. */
export type PagePlan = { index: number; turn: number }

/**
 * Makes a new PDF from one PDF's pages, in the order given, each turned
 * clockwise by `turn` degrees (a multiple of 90). Pages left out of the plan
 * are dropped. Like merging, it starts a fresh PDF, so the original's title,
 * author and other details are left behind, and form fields are drawn into
 * their pages first. Bookmarks go to their pages' new places, and ones for
 * deleted pages are dropped.
 */
export async function organisePdf(
  file: ArrayBuffer,
  plan: PagePlan[],
): Promise<Uint8Array> {
  try {
    if (plan.length === 0) throw new Error('No pages to keep')
    const source = await loadPdf(file)
    await flattenForm(source)
    const links = detachLinks(source)
    const result = await PDFDocument.create()
    const pages = await result.copyPages(
      source,
      plan.map((page) => page.index),
    )
    pages.forEach((page, i) => {
      const angle = page.getRotation().angle + plan[i].turn
      page.setRotation(degrees(((angle % 360) + 360) % 360))
      result.addPage(page)
    })
    const places = new Map<number, number>()
    plan.forEach((page, i) => {
      if (!places.has(page.index)) places.set(page.index, i)
    })
    attachLinks(
      result,
      links,
      pages.map((page, i) => [plan[i].index, page]),
      (page) => places.get(page),
    )
    keepOutline(
      result,
      moveOutline(readOutline(source), (page) => places.get(page)),
      opensWithOutline(source),
    )
    result.setCreator('Tuls')
    result.setProducer('Tuls')
    return await result.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
