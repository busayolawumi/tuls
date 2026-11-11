import { LANGUAGES } from '../../../engines/tesseract/languages'
import { pageRanges } from '../../pdf-to-word/lib/files'

export const MAX_FILES = 20
// Checking a page for text takes pdf.js a moment, so long PDFs are fine as
// long as few of their pages need reading.
export const MAX_PAGES = 1000
// A few seconds a page on a laptop, so 200 is several minutes. Phones are
// slower and have less memory.
export const MAX_TO_READ = 200
export const MAX_TO_READ_PHONE = 50
/** How sharp pages are drawn for reading. 200 dpi was only 15–25% faster. */
export const DPI = 300

/** Readers side by side: one on a phone, up to four on a computer. */
export function readerCount(pages: number, phone: boolean, cores = 4) {
  if (phone) return 1
  return Math.max(1, Math.min(4, cores - 1, pages))
}

// Upright pages scored 56–92 in testing, and pages read the wrong way up
// 16–43. Below TRY_TURNS, the other three ways are tried on a small copy.
export const TRY_TURNS = 50
const CLEAR_WIN = 15
// Text read with less confidence than this is mostly noise.
export const KEEP_TEXT = 30

/**
 * Which way up to read a page, from how confidently a small copy read at
 * each quarter turn clockwise (0–3): another turn only if it's clearly
 * better than as it is, and good enough to trust.
 */
export function chooseTurn(scores: number[]) {
  let best = 0
  for (const [turn, score] of scores.entries()) {
    if (score > scores[best]) best = turn
  }
  const clear =
    scores[best] >= TRY_TURNS && scores[best] >= scores[0] + CLEAR_WIN
  return best !== 0 && clear ? best : 0
}

/** Whether a page's read found text worth keeping. */
export const hasReadableText = ({
  words,
  confidence,
}: {
  words: number
  confidence: number
}) => words > 0 && confidence >= KEEP_TEXT

/** "About 3 minutes left", once there's enough to go on. */
export function timeLeft(done: number, total: number, elapsed: number) {
  if (done < 1 || elapsed < 3000 || done >= total) return undefined
  const seconds = ((total - done) * elapsed) / done / 1000
  if (seconds < 50) return 'Less than a minute left'
  const minutes = Math.round(seconds / 60)
  return minutes <= 1 ? 'About a minute left' : `About ${minutes} minutes left`
}

const KEY = 'tuls:ocr-pdf:language'

/** The browser's own language if Tuls can read it, else English. */
export function defaultLanguage(tags: readonly string[]) {
  for (const tag of tags) {
    const primary = tag.toLowerCase().split('-')[0]
    const match = LANGUAGES.find((language) => language.tag === primary)
    if (match) return match.code
  }
  return 'eng'
}

/** The language chosen last time, or the default. */
export function loadLanguage(
  storage: Pick<Storage, 'getItem'> | undefined,
  tags: readonly string[],
) {
  try {
    const saved = storage?.getItem(KEY)
    if (LANGUAGES.some((language) => language.code === saved)) return saved!
  } catch {
    // Blocked storage.
  }
  return defaultLanguage(tags)
}

export function saveLanguage(
  storage: Pick<Storage, 'setItem'> | undefined,
  code: string,
) {
  try {
    storage?.setItem(KEY, code)
  } catch {
    // Not remembered, which is fine.
  }
}

export const HAS_PASSWORD =
  'It has a password. Take it off first with Unlock PDF.'
export const ALREADY_TEXT = 'It already has text you can search and copy.'
export const NOTHING_FOUND =
  'No text could be read in it. Its pages may be pictures, or too faint or blurry to read.'

export const tooManyPages = (pages: number) =>
  `It has ${pages} pages. Each PDF can have up to ${MAX_PAGES}.`

export function tooManyToRead(scanned: number, phone: boolean) {
  return phone
    ? `It has ${scanned} scanned pages. On a phone, up to ${MAX_TO_READ_PHONE} can be read at once: try a computer, or split it first.`
    : `It has ${scanned} scanned pages. Up to ${MAX_TO_READ} can be read at once: split it first, then read each part.`
}

/** "3 of 14 pages to read", or "All 14 pages to read". */
export function toReadLabel(pages: number, scanned: number) {
  if (scanned === pages) {
    return pages === 1 ? '1 page to read' : `All ${pages} pages to read`
  }
  return `${scanned} of ${pages} pages to read`
}

/** "all 5 pages", or "both pages". */
const allPages = (pages: number) =>
  pages === 2 ? 'both pages' : `all ${pages} pages`

const pagesWord = (pages: number[]) =>
  pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pageRanges(pages)}`

/** What happened to a PDF's pages, a sentence each. */
export function outcomeNotes({
  pages,
  read,
  turned,
  unreadable,
}: {
  pages: number
  /** Pages with text added, numbered from 1. */
  read: number[]
  turned: number[]
  unreadable: number[]
}) {
  const notes: string[] = []
  if (read.length === pages) {
    notes.push(
      pages === 1 ? 'Text added.' : `Text added to ${allPages(pages)}.`,
    )
  } else {
    notes.push(`Text added to ${pagesWord(read).toLowerCase()}.`)
    const had = pages - read.length - unreadable.length
    if (had > 0) {
      notes.push(
        had === 1
          ? 'One page had text already.'
          : `${had} pages had text already.`,
      )
    }
  }
  if (turned.length > 0) {
    notes.push(
      `${pagesWord(turned)} ${turned.length === 1 ? 'was' : 'were'} sideways or upside down, so ${turned.length === 1 ? 'it’s' : 'they’ve'} been turned the right way up.`,
    )
  }
  if (unreadable.length > 0) {
    notes.push(
      `No text could be read on ${pagesWord(unreadable).toLowerCase()}: ${unreadable.length === 1 ? 'it may be a picture' : 'they may be pictures'}, or too faint to read.`,
    )
  }
  return notes
}

/** "Text on 12 of 14 pages", for a list of results. */
export const textOnLabel = (read: number, pages: number) =>
  read === pages
    ? `Text on ${pages === 1 ? 'its page' : allPages(pages)}`
    : `Text on ${read} of ${pages} pages`
