import { decodeText, readCsv, type Separator } from '../../lib/csv'
import { paperFor, printLayout } from '../../lib/xlsx/print'
import { sheetOf } from '../../lib/xlsx/sheet'
import { readValue, regionColumn, type Column } from '../../lib/xlsx/values'
import { writeXlsx } from '../../lib/xlsx/write'
import { documentBase } from '../../lib/outputNames'

export const CSV_EXTENSIONS = ['csv', 'tsv']
export const MAX_ROWS = 100_000
const WRAP_ABOVE = 60

export class CsvError extends Error {}

/** Whether the first row names the columns: text (or years) over values, or all text. */
export function headingRows(rows: string[][], column: Column) {
  if (rows.length < 2) return 0
  const isHeading = (cell: string) => {
    const value = readValue(cell, column)
    if (value.kind === 'empty' || value.kind === 'text') return true
    return /^(19|20)\d\d$/.test(cell.trim())
  }
  const first = rows[0]
  if (!first.some((cell) => cell.trim()) || !first.every(isHeading)) return 0
  return 1
}

/**
 * A CSV as a spreadsheet laid out for printing: its own separator and
 * number style, the heading row on every page, and the page shape and size
 * that keep the columns together and the text readable.
 */
export function csvToXlsx(bytes: Uint8Array, name: string, locale?: string) {
  const prefer: Separator | undefined = /\.tsv$/i.test(name) ? '\t' : undefined
  const { rows } = readCsv(decodeText(bytes), prefer)
  if (rows.length === 0 || rows.every((row) => row.every((c) => !c.trim()))) {
    throw new CsvError('It’s empty.')
  }
  if (rows.length > MAX_ROWS) {
    throw new CsvError(
      `It has ${rows.length.toLocaleString('en')} rows. Up to ${MAX_ROWS.toLocaleString('en')} can go into one PDF.`,
    )
  }
  const region = regionColumn(locale)
  const header = headingRows(rows, region)
  const sheet = sheetOf(documentBase(name), rows, header, region)
  sheet.wrap = sheet.widths.map((_, c) => {
    for (const row of rows) if ((row[c] ?? '').length > WRAP_ABOVE) return true
    return false
  })
  sheet.print = printLayout(sheet.widths, paperFor(locale))
  return writeXlsx([sheet])
}
