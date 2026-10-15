import { PDFDocument } from '@cantoo/pdf-lib'
import { zipFiles } from '../../lib/zip'
import { PdfError, pdfErrorKind } from './errors'
import { flattenForm } from './forms'
import { loadPdf } from './load'

/** One of the new PDFs: its file name, and its pages (numbered from 0). */
export type SplitPart = { name: string; pages: number[] }

export type SplitResult = {
  /** One PDF per part, in order. */
  files: Uint8Array<ArrayBuffer>[]
  /** All of them in one ZIP, when there's more than one. */
  zip?: Uint8Array<ArrayBuffer>
}

/**
 * Makes one PDF per part from a PDF's pages, plus a ZIP of them all. Like
 * merging, each part starts as a fresh PDF, so the original's title, author
 * and other details are left behind, and form fields are drawn into their
 * pages first.
 */
export async function splitPdf(
  file: ArrayBuffer,
  parts: SplitPart[],
): Promise<SplitResult> {
  try {
    if (parts.length === 0) throw new Error('No parts to make')
    const source = await loadPdf(file)
    flattenForm(source)
    const files: Uint8Array<ArrayBuffer>[] = []
    for (const part of parts) {
      const result = await PDFDocument.create()
      const pages = await result.copyPages(source, part.pages)
      for (const page of pages) result.addPage(page)
      result.setCreator('Tuls')
      result.setProducer('Tuls')
      files.push((await result.save()) as Uint8Array<ArrayBuffer>)
    }
    const zip =
      files.length > 1
        ? zipFiles(
            parts.map((part, i) => ({ name: part.name, data: files[i] })),
          )
        : undefined
    return { files, zip }
  } catch (e) {
    throw new PdfError(pdfErrorKind(e), e)
  }
}
