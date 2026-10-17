// pdf2docx reports how far it's got on its log: "[3/4] Parsing pages...",
// then a line per page, "(3/15) Page 3", then "[4/4] Creating pages..." and a
// line per page again.

export type Progress = {
  phase: 'reading' | 'writing'
  page: number
  pages: number
}

// The log is coloured for a terminal, with escape codes.
// oxlint-disable-next-line no-control-regex
const COLOURS = /\u001b\[[0-9;]*m/g
const PAGE = /\((\d+)\/(\d+)\) Page\b/

/** Reads the log a line at a time, calling `onProgress` for each page. */
export function progressReader(onProgress: (progress: Progress) => void) {
  let phase: Progress['phase'] = 'reading'
  return (line: string) => {
    const text = line.replace(COLOURS, '')
    if (text.includes('[3/4]')) phase = 'reading'
    if (text.includes('[4/4]')) phase = 'writing'
    const page = PAGE.exec(text)
    if (page) {
      onProgress({ phase, page: Number(page[1]), pages: Number(page[2]) })
    }
  }
}

/** How far through a PDF, 0–1: reading its pages, then writing them. */
export function progressRatio({ phase, page, pages }: Progress) {
  return Math.min(((phase === 'writing' ? pages : 0) + page) / (2 * pages), 1)
}
