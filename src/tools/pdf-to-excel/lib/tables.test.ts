import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  pagesName,
  scannedNote,
  sizeLabel,
  tablesLabel,
  workbook,
} from './tables'

describe('what PDF to Excel says', () => {
  it('names a table’s pages', () => {
    expect(pagesName([3])).toBe('Page 3')
    expect(pagesName([3, 4, 5])).toBe('Pages 3–5')
  })

  it('counts rows without the headings', () => {
    expect(
      sizeLabel({
        pages: [1],
        header: 1,
        rows: [
          ['A', 'B'],
          ['1', '2'],
        ],
      }),
    ).toBe('1 row × 2 columns')
    expect(
      sizeLabel({ pages: [1], header: 0, rows: [['1'], ['2'], ['3']] }),
    ).toBe('3 rows × 1 column')
    expect(tablesLabel(1)).toBe('1 table')
    expect(tablesLabel(3)).toBe('3 tables')
  })

  it('points out scanned pages', () => {
    expect(scannedNote([])).toBeUndefined()
    expect(scannedNote([2])).toBe(
      'Page 2 is scanned, so any table on it is left out.',
    )
    expect(scannedNote([2, 3, 5])).toBe(
      'Pages 2–3 and 5 are scanned, so any tables on them are left out.',
    )
  })
})

describe('the workbook', () => {
  it('has a sheet for each table, named by its pages', () => {
    const file = workbook(
      [
        {
          pages: [1, 2],
          header: 1,
          rows: [
            ['Date', 'Amount'],
            ['03/01/2026', '12.50'],
          ],
        },
        {
          pages: [2],
          header: 1,
          rows: [
            ['Item', 'Qty'],
            ['Ink', '2'],
          ],
        },
        {
          pages: [2],
          header: 0,
          rows: [
            ['x', '1'],
            ['y', '2'],
          ],
        },
      ],
      { decimal: '.', dayFirst: true },
    )
    const parts = unzipSync(file)
    const book = strFromU8(parts['xl/workbook.xml'])
    expect(book).toContain('name="Pages 1–2"')
    expect(book).toContain('name="Page 2"')
    expect(book).toContain('name="Page 2 (2)"')
    expect(strFromU8(parts['xl/worksheets/sheet1.xml'])).toContain(
      '<v>46025</v>',
    )
  })
})
