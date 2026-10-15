import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import { PdfError, pdfErrorKind } from './errors'
import { flattenForm } from './forms'
import { loadPdf } from './load'

/** A page of the new PDF: which original page (from 0), and how far to turn it. */
export type PagePlan = { index: number; turn: number }

/**
 * Makes a new PDF from one PDF's pages, in the order given, each turned
 * clockwise by `turn` degrees (a multiple of 90). Pages left out of the plan
 * are dropped. Like merging, it starts a fresh PDF, so the original's title,
 * author and other details are left behind, and form fields are drawn into
 * their pages first.
 */
export async function organisePdf(
  file: ArrayBuffer,
  plan: PagePlan[],
): Promise<Uint8Array> {
  try {
    if (plan.length === 0) throw new Error('No pages to keep')
    const source = await loadPdf(file)
    flattenForm(source)
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
    result.setCreator('Tuls')
    result.setProducer('Tuls')
    return await result.save()
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
