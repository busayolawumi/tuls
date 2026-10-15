import { formatSize } from '../../../lib/format'

/** For the file picker's `accept` attribute. */
export const ACCEPT = 'application/pdf,.pdf'

// Each PDF is read into memory, and big ones are hard on phones.
export const MAX_FILE_SIZE = 200_000_000

/** Says why a file can't be merged, or returns undefined if it can. */
export function checkPdf(file: File): string | undefined {
  // Some browsers give PDFs no type, so the extension counts too.
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf) return 'That isn’t a PDF.'
  if (file.size > MAX_FILE_SIZE) {
    return `That PDF is ${formatSize(file.size)}. Each PDF can be up to ${formatSize(MAX_FILE_SIZE)}.`
  }
}

/** The merged file's name: the first PDF's name plus "-merged". */
export function mergedFileName(firstName: string) {
  const base = firstName.replace(/\.pdf$/i, '') || 'document'
  return `${base}-merged.pdf`
}

/** Moves the item at `from` to `to`, returning a new list. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** "1 page", "12 pages". */
export function pagesLabel(count: number) {
  return `${count} ${count === 1 ? 'page' : 'pages'}`
}
