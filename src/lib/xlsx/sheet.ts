import type { Print } from './print'
import {
  columnFormat,
  readColumn,
  readValue,
  type Column,
  type Value,
} from './values'

export type Sheet = {
  name: string
  rows: Value[][]
  /** Rows at the top that are headings: bold, and kept in view. */
  header: number
  /** Ranges such as "B1:C1". */
  merges: string[]
  /** In characters, as Excel measures columns. */
  widths: number[]
  /** Columns whose long text wraps. */
  wrap?: boolean[]
  /** How it prints, for a sheet made to be printed. */
  print?: Print
}

/** The longest row's length, for any number of rows. */
export function widest(rows: unknown[][]) {
  let most = 0
  for (const row of rows) most = Math.max(most, row.length)
  return most
}

export function cellRef(row: number, column: number) {
  let letters = ''
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  }
  return `${letters}${row + 1}`
}

/** Cells covered by a merged cell are null: each merge, by its corners. */
export function mergesOf(rows: (string | null)[][]) {
  const covered = new Set<string>()
  const merges: string[] = []
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === null || covered.has(`${r},${c}`)) continue
      let right = c
      while (rows[r][right + 1] === null && !covered.has(`${r},${right + 1}`)) {
        right++
      }
      let bottom = r
      while (
        bottom + 1 < rows.length &&
        rows[bottom + 1].slice(c, right + 1).every((cell) => cell === null)
      ) {
        bottom++
      }
      if (right === c && bottom === r) continue
      for (let y = r; y <= bottom; y++) {
        for (let x = c; x <= right; x++) covered.add(`${y},${x}`)
      }
      merges.push(`${cellRef(r, c)}:${cellRef(bottom, right)}`)
    }
  }
  return merges
}

function width(value: Value) {
  if (value.kind === 'empty') return 0
  if (value.kind === 'text') return value.text.length
  if (value.kind === 'date') return value.format.replace(/\\/g, '').length + 1
  return String(Math.round(Math.abs(value.value))).length * 1.4 + 4
}

/** A table's text as a sheet of typed values, read column by column. */
export function sheetOf(
  name: string,
  rows: (string | null)[][],
  header: number,
  region: Column,
): Sheet {
  const columns = widest(rows)
  const body = rows.slice(header)
  const typed: Value[][] = rows.map((row, r) =>
    r < header
      ? row.map((cell) =>
          cell?.trim()
            ? { kind: 'text', text: cell.trim() }
            : { kind: 'empty' },
        )
      : [],
  )
  const widths: number[] = []
  for (let c = 0; c < columns; c++) {
    const cells = body.map((row) => row[c] ?? '')
    const column = readColumn(cells, region)
    const values = cells.map((cell) => readValue(cell, column))
    const format = columnFormat(values)
    values.forEach((value, i) => {
      typed[header + i][c] =
        value.kind === 'number' && format ? { ...value, format } : value
    })
    let most = 6
    for (const row of rows.slice(0, header)) {
      most = Math.max(most, (row[c] ?? '').length + 2)
    }
    for (const value of values) most = Math.max(most, width(value) + 2)
    widths.push(Math.round(Math.min(60, most)))
  }
  return { name, rows: typed, header, merges: mergesOf(rows), widths }
}
