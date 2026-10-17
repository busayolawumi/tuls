import { closePdf, openPdf, pagePicture } from '../../../engines/pdf/pdfjs'
import { hasText, MAX_PAGES } from './files'

// Before converting, each PDF is opened with pdf.js (already used by the
// other PDF tools, and much lighter than the engine): its page count, which
// pages have no text (scans), and a picture of its first page for the
// results. A password or a damaged file shows up here, as a pdf.js error.

export type Inspected = {
  pages: number
  /** Pages with no text, numbered from 1. */
  scanned: number[]
  picture: string | null
}

// Big enough for the result's preview; the list's thumbnails are smaller.
const PICTURE_SIZE = 600

export async function inspectPdf(file: File): Promise<Inspected> {
  const doc = await openPdf(await file.arrayBuffer())
  try {
    const scanned: number[] = []
    // Too long to convert anyway: no need to read its text.
    if (doc.numPages <= MAX_PAGES) {
      for (let number = 1; number <= doc.numPages; number++) {
        const page = await doc.getPage(number)
        try {
          if (!hasText((await page.getTextContent()).items)) {
            scanned.push(number)
          }
        } finally {
          page.cleanup()
        }
      }
    }
    const picture = await pagePicture(doc, 1, PICTURE_SIZE, PICTURE_SIZE).catch(
      () => null,
    )
    return { pages: doc.numPages, scanned, picture }
  } finally {
    await closePdf(doc)
  }
}
