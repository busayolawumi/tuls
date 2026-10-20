import type { FoundTable } from '../../../engines/pymupdf/worker'
import { sheetOf, widest } from '../../../lib/xlsx/sheet'
import type { Column } from '../../../lib/xlsx/values'
import { writeXlsx } from '../../../lib/xlsx/write'
import { pageRanges } from '../../pdf-to-word/lib/files'

export const MAX_FILE_SIZE = 100_000_000
export const MAX_PAGES = 500
export const MAX_FILES = 20
export const PREVIEW_ROWS = 4

export const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const tooManyPages = (pages: number) =>
  `It has ${pages} pages. Each PDF can have up to ${MAX_PAGES}.`

export const ALL_SCANNED =
  'It’s scanned, so its pages are pictures, and Tuls can’t read tables in pictures yet.'

/** For a PDF with some scanned pages, whose tables can’t be read. */
export function scannedNote(scanned: number[]) {
  if (scanned.length === 0) return undefined
  return scanned.length === 1
    ? `Page ${scanned[0]} is scanned, so any table on it is left out.`
    : `Pages ${pageRanges(scanned)} are scanned, so any tables on them are left out.`
}

/** "Page 3" or "Pages 3–9". */
export function pagesName(pages: number[]) {
  const first = pages[0]
  const last = pages.at(-1)!
  return first === last ? `Page ${first}` : `Pages ${first}–${last}`
}

/** "43 rows × 5 columns", not counting headings. */
export function sizeLabel(table: FoundTable) {
  const rows = table.rows.length - table.header
  const columns = widest(table.rows)
  return `${rows} ${rows === 1 ? 'row' : 'rows'} × ${columns} ${columns === 1 ? 'column' : 'columns'}`
}

export const tablesLabel = (count: number) =>
  `${count} ${count === 1 ? 'table' : 'tables'}`

/** The chosen tables as an Excel file, one sheet each. */
export function workbook(tables: FoundTable[], region: Column) {
  return writeXlsx(
    tables.map((table) =>
      sheetOf(pagesName(table.pages), table.rows, table.header, region),
    ),
  )
}
