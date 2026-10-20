import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { columnPoints, paperFor, printLayout } from '../../lib/xlsx/print'
import { CsvError, csvToXlsx, headingRows, MAX_ROWS } from './csv'

const UK = { decimal: '.', dayFirst: true } as const

function parts(csv: string, name = 'data.csv', locale = 'en-GB') {
  const files = unzipSync(
    csvToXlsx(new TextEncoder().encode(csv), name, locale),
  )
  return {
    sheet: strFromU8(files['xl/worksheets/sheet1.xml']),
    book: strFromU8(files['xl/workbook.xml']),
  }
}

describe('paper and page shape', () => {
  it('uses Letter where people do, A4 elsewhere', () => {
    expect(paperFor('en-US')).toBe('letter')
    expect(paperFor('en-CA')).toBe('letter')
    expect(paperFor('es-MX')).toBe('letter')
    expect(paperFor('en-GB')).toBe('a4')
    expect(paperFor('en-NG')).toBe('a4')
    expect(paperFor('fr')).toBe('a4')
    expect(paperFor('not a locale!')).toBe('a4')
  })

  it('keeps columns together, without making text too small', () => {
    const cols = (n: number) => Array.from({ length: n }, () => 12)
    expect(printLayout(cols(4), 'a4')).toMatchObject({
      landscape: false,
      fit: false,
    })
    expect(printLayout(cols(8), 'a4')).toMatchObject({
      landscape: false,
      fit: true,
    })
    expect(printLayout(cols(10), 'a4')).toMatchObject({
      landscape: true,
      fit: false,
    })
    expect(printLayout(cols(14), 'a4')).toMatchObject({
      landscape: true,
      fit: true,
    })
    expect(printLayout(cols(30), 'a4')).toEqual({
      paper: 'a4',
      landscape: true,
      fit: false,
      scale: 60,
      repeatFirstColumn: true,
    })
    expect(columnPoints(12)).toBeCloseTo(66.75)
  })
})

describe('headings', () => {
  it('takes a first row of names over values, or a table of text', () => {
    expect(
      headingRows(
        [
          ['Name', 'Amount'],
          ['Ada', '1.50'],
        ],
        UK,
      ),
    ).toBe(1)
    expect(
      headingRows(
        [
          ['Region', '2025'],
          ['North', '12'],
        ],
        UK,
      ),
    ).toBe(1)
    expect(
      headingRows(
        [
          ['Name', 'Town'],
          ['Ada', 'Lagos'],
        ],
        UK,
      ),
    ).toBe(1)
    expect(
      headingRows(
        [
          ['Ada', '1.50'],
          ['Bo', '2'],
        ],
        UK,
      ),
    ).toBe(0)
    expect(headingRows([['Name']], UK)).toBe(0)
  })
})

describe('a CSV as a printable sheet', () => {
  it('reads a semicolon CSV with decimal commas as numbers', () => {
    const { sheet } = parts(
      'Datum;Betrag\n03.01.2026;1.234,50\n04.01.2026;-12,00',
    )
    expect(sheet).toContain('<v>1234.5</v>')
    expect(sheet).toContain('<v>-12</v>')
    expect(sheet).toContain('<v>46025</v>')
    expect(sheet).toContain('paperSize="9"')
  })

  it('repeats the heading on every page, with gridlines and the paper set', () => {
    const { sheet, book } = parts(
      'Name,Amount\nAda,1.50\nBo,2',
      'x.csv',
      'en-US',
    )
    expect(book).toContain(
      `<definedName name="_xlnm.Print_Titles" localSheetId="0">'x'!$1:$1</definedName>`,
    )
    expect(sheet).toContain('<printOptions gridLines="1"/>')
    expect(sheet).toContain(
      '<pageSetup paperSize="1" orientation="portrait" scale="100"/>',
    )
  })

  it('shrinks wide CSVs to fit, or repeats the first column when very wide', () => {
    const row = (n: number, text: string) =>
      Array.from({ length: n }, (_, i) => `${text}${i}`).join(',')
    const wide = parts(`${row(14, 'Column ')}\n${row(14, 'value ')}`)
    expect(wide.sheet).toContain(
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
    )
    expect(wide.sheet).toContain(
      'orientation="landscape" fitToWidth="1" fitToHeight="0"',
    )
    const wider = parts(`${row(40, 'Column ')}\n${row(40, 'value ')}`, 'w.csv')
    expect(wider.sheet).toContain('orientation="landscape" scale="60"')
    expect(wider.book).toContain(`'w'!$A:$A,'w'!$1:$1`)
  })

  it('wraps long text, and keeps codes as text', () => {
    const note = 'word '.repeat(20).trim()
    const { sheet } = parts(`ID,Note\n007,${note}\n008,short`)
    expect(sheet).toContain(`<c r="B2" t="inlineStr" s="2">`)
    expect(sheet).toContain('>007<')
  })

  it('names what can’t be done', () => {
    expect(() => parts(' \n,\n')).toThrow(new CsvError('It’s empty.'))
    const many = 'n\n' + '1\n'.repeat(MAX_ROWS + 1)
    expect(() => parts(many)).toThrow(/Up to 100,000 can go into one PDF/)
  })
})
