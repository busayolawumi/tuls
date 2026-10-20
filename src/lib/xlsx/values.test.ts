import { describe, expect, it } from 'vitest'
import {
  columnFormat,
  readColumn,
  readValue,
  regionColumn,
  type Column,
} from './values'

const UK: Column = { decimal: '.', dayFirst: true }
const US: Column = { decimal: '.', dayFirst: false }
const DE: Column = { decimal: ',', dayFirst: true }

const number = (cell: string, column = UK) => {
  const value = readValue(cell, column)
  return value.kind === 'number' ? value.value : value
}

describe('numbers', () => {
  it('reads amounts, with or without grouping and currency', () => {
    expect(number('2,450.33')).toBe(2450.33)
    expect(number('£1,234.50')).toBe(1234.5)
    expect(number('₦ 12,000')).toBe(12000)
    expect(number('9826.08')).toBe(9826.08)
    expect(number('0.42')).toBe(0.42)
    expect(number('7')).toBe(7)
  })

  it('reads each way of writing a negative', () => {
    expect(number('-60')).toBe(-60)
    expect(number('−12.50')).toBe(-12.5)
    expect(number('(45)')).toBe(-45)
    expect(number('(£1,200.00)')).toBe(-1200)
    expect(number('-£78.26')).toBe(-78.26)
    expect(number('£-78.26')).toBe(-78.26)
    expect(number('250.00-')).toBe(-250)
    expect(number('1,000.00 DR')).toBe(-1000)
    expect(number('1,000.00 OD')).toBe(-1000)
    expect(number('1,000.00 CR')).toBe(1000)
  })

  it('reads percentages as shares', () => {
    expect(number('12.5%')).toBe(0.125)
    expect(number('-27%')).toBe(-0.27)
    expect(number('+36%')).toBe(0.36)
  })

  it('reads decimal commas in a column that uses them', () => {
    expect(number('2.450,33', DE)).toBe(2450.33)
    expect(number('240,39', DE)).toBe(240.39)
    expect(number('1 234,50', DE)).toBe(1234.5)
    expect(number('1.234', DE)).toBe(1234)
  })

  it('keeps codes and things that only look like numbers as text', () => {
    for (const cell of [
      '0123',
      '00-00-00',
      '+234 803 123 4567',
      '1234567890123',
      '4111 1111 1111 1111',
      '1.2.3',
      'n/a',
      '–',
      'Rent',
      '12 Main Street',
    ]) {
      expect(readValue(cell, UK), cell).toEqual({ kind: 'text', text: cell })
    }
  })
})

describe('dates', () => {
  const date = (cell: string, column = UK) => {
    const value = readValue(cell, column)
    if (value.kind !== 'date') return value
    const day = new Date(Date.UTC(1899, 11, 30) + value.value * 86_400_000)
    return [day.toISOString().slice(0, 10), value.format]
  }

  it('reads the ways statements write dates', () => {
    expect(date('03/01/2026')).toEqual(['2026-01-03', 'dd/mm/yyyy'])
    expect(date('03/01/2026', US)).toEqual(['2026-03-01', 'mm/dd/yyyy'])
    expect(date('3.1.26', DE)).toEqual(['2026-01-03', 'd\\.m\\.yy'])
    expect(date('02 Jan 2026')).toEqual(['2026-01-02', 'dd mmm yyyy'])
    expect(date('2 January 2026')).toEqual(['2026-01-02', 'd mmmm yyyy'])
    expect(date('02-Jan-26')).toEqual(['2026-01-02', 'dd-mmm-yy'])
    expect(date('Jan 2, 2026')).toEqual(['2026-01-02', 'mmm d, yyyy'])
    expect(date('2026-01-03')).toEqual(['2026-01-03', 'yyyy-mm-dd'])
  })

  it('leaves impossible dates, and dates without a year, as text', () => {
    expect(readValue('31/02/2026', UK).kind).toBe('text')
    expect(readValue('13/13/2026', UK).kind).toBe('text')
    expect(readValue('03 Jan', UK).kind).toBe('text')
  })
})

describe('reading a column', () => {
  it('tells day-first from month-first by the dates themselves', () => {
    expect(readColumn(['01/02/2026', '13/02/2026'], US).dayFirst).toBe(true)
    expect(readColumn(['01/02/2026', '02/13/2026'], UK).dayFirst).toBe(false)
    expect(readColumn(['01/02/2026'], US).dayFirst).toBe(false)
  })

  it('tells the decimal mark by the amounts themselves', () => {
    expect(readColumn(['2.450,33', '240,39'], UK).decimal).toBe(',')
    expect(readColumn(['2,450.33', '240.39'], DE).decimal).toBe('.')
    expect(readColumn(['1,234', '12'], DE).decimal).toBe(',')
  })

  it('goes by the region when the cells can’t tell', () => {
    expect(regionColumn('en-GB')).toEqual(UK)
    expect(regionColumn('en-US')).toEqual(US)
    expect(regionColumn('de-DE')).toEqual(DE)
    expect(regionColumn('not a locale!')).toEqual(UK)
  })
})

describe('a column’s format', () => {
  it('lines numbers up with one format', () => {
    const values = ['980', '1,200', '1,350.5', '(45)'].map((cell) =>
      readValue(cell, UK),
    )
    expect(columnFormat(values)).toBe('#,##0.0')
  })

  it('keeps the currency most of the column has', () => {
    const values = ['£12.50', '£1,234.00', '7.00', 'n/a'].map((cell) =>
      readValue(cell, UK),
    )
    expect(columnFormat(values)).toBe('"£"#,##0.00')
    expect(columnFormat([readValue('12,50 €', DE)])).toBe('0.00 "€"')
    expect(columnFormat([readValue('12.5%', UK)])).toBe('0.0%')
  })

  it('has none for a column without numbers', () => {
    expect(columnFormat([readValue('Rent', UK)])).toBeUndefined()
  })
})
