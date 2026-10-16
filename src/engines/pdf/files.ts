import { formatSize } from '../../lib/format'

// What every PDF tool checks before opening a file, and how it names what
// it makes.

/** For the file picker's `accept` attribute. */
export const ACCEPT = 'application/pdf,.pdf'

// Each PDF is read into memory, and big ones are hard on phones.
export const MAX_FILE_SIZE = 200_000_000

/** Says why a file can't be used, or returns undefined if it can. */
export function checkPdf(file: File): string | undefined {
  // Some browsers give PDFs no type, so the extension counts too.
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return 'That isn’t a PDF.'
  if (file.size > MAX_FILE_SIZE) {
    return `That PDF is ${formatSize(file.size)}. Each PDF can be up to ${formatSize(MAX_FILE_SIZE)}.`
  }
}

/** A PDF's name without .pdf, e.g. report.pdf → report. */
export function pdfBase(original: string) {
  return original.replace(/\.pdf$/i, '') || 'document'
}

/** A new PDF's name from the original's, e.g. report.pdf → report-merged.pdf. */
export function outputName(original: string, suffix: string) {
  return `${pdfBase(original)}-${suffix}.pdf`
}

/** "1 page", "12 pages". */
export function pagesLabel(count: number) {
  return `${count} ${count === 1 ? 'page' : 'pages'}`
}
