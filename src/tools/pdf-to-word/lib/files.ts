import { formatSize } from '../../../lib/format'

// What PDF to Word checks before converting, and what it says about
// scanned pages.

// Each PDF is read into memory, and Python works on it there; the engine
// took 0.4–0.75 GB for the spike's PDFs (CLAUDE.md).
export const MAX_FILE_SIZE = 100_000_000
// About a second a page on a laptop, so 300 pages is a few minutes.
export const MAX_PAGES = 300
export const MAX_FILES = 20

/** Says why a file can't be used, or returns undefined if it can. */
export function checkPdfFile(file: File): string | undefined {
  // Some browsers give PDFs no type, so the extension counts too.
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return 'That isn’t a PDF.'
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_FILE_SIZE) {
    return `That PDF is ${formatSize(file.size)}. Each can be up to ${formatSize(MAX_FILE_SIZE)}.`
  }
}

/** For a PDF with too many pages. */
export const tooManyPages = (pages: number) =>
  `It has ${pages} pages. Each PDF can have up to ${MAX_PAGES}.`

/** Page numbers as ranges, e.g. [1, 2, 3, 5, 7, 8] → "1–3, 5 and 7–8". */
export function pageRanges(pages: number[]) {
  const ranges: string[] = []
  const sorted = [...pages].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    let end = i
    while (sorted[end + 1] === sorted[end] + 1) end++
    ranges.push(end === i ? `${sorted[i]}` : `${sorted[i]}–${sorted[end]}`)
    i = end
  }
  return ranges.length > 1
    ? `${ranges.slice(0, -1).join(', ')} and ${ranges.at(-1)}`
    : (ranges[0] ?? '')
}

/**
 * What to say about a PDF whose pages (`scanned`, numbered from 1) have no
 * text: they're pictures, and stay pictures in Word. Undefined if none.
 */
export function scanNote(pages: number, scanned: number[]) {
  if (scanned.length === 0) return undefined
  const after = 'not text you can edit.'
  if (scanned.length === pages) {
    return pages === 1
      ? `It’s scanned, so its page is a picture. In Word it will stay a picture, ${after}`
      : `It’s scanned, so its pages are pictures. In Word they’ll stay pictures, ${after}`
  }
  return scanned.length === 1
    ? `Page ${scanned[0]} is scanned, so it will be a picture in Word, ${after}`
    : `Pages ${pageRanges(scanned)} are scanned, so they’ll be pictures in Word, ${after}`
}

/** Whether a page's text items (pdf.js's getTextContent) have any words. */
export function hasText(items: unknown[]) {
  return items.some(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'str' in item &&
      typeof item.str === 'string' &&
      item.str.trim() !== '',
  )
}

/** For pages the converter couldn't do, which aren't in the Word file. */
export function leftOutPages(pages: number[]) {
  return pages.length === 1
    ? `Page ${pages[0]} couldn’t be converted, so it’s left out of the Word file.`
    : `Pages ${pageRanges(pages)} couldn’t be converted, so they’re left out of the Word file.`
}

/** "From a 12-page PDF". */
export const fromPages = (pages: number) => `From a ${pages}-page PDF`
