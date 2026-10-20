import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { cellRef, mergesOf, sheetOf } from './sheet'
import { sheetNames, writeXlsx } from './write'

const UK = { decimal: '.', dayFirst: true } as const

function parts(data: Uint8Array) {
  return Object.fromEntries(
    Object.entries(unzipSync(data)).map(([name, bytes]) => [
      name,
      strFromU8(bytes),
    ]),
  )
}

describe('cells and merges', () => {
  it('names cells as Excel does', () => {
    expect(cellRef(0, 0)).toBe('A1')
    expect(cellRef(9, 25)).toBe('Z10')
    expect(cellRef(0, 26)).toBe('AA1')
    expect(cellRef(0, 701)).toBe('ZZ1')
    expect(cellRef(0, 702)).toBe('AAA1')
  })

  it('merges across and down', () => {
    expect(
      mergesOf([
        ['Region', '2025', null, 'Change'],
        ['', 'H1', 'H2', ''],
        ['North', '1', '2', '3'],
      ]),
    ).toEqual(['B1:C1'])
    expect(
      mergesOf([
        ['Total', 'A', 'B'],
        [null, '1', '2'],
        ['X', null, null],
      ]),
    ).toEqual(['A1:A2', 'B2:B3', 'C2:C3'])
    expect(
      mergesOf([
        ['Left', null, 'C'],
        [null, null, 'D'],
      ]),
    ).toEqual(['A1:B2'])
  })
})

describe('sheets', () => {
  it('types each column, keeping headings as text', () => {
    const sheet = sheetOf(
      'Page 1',
      [
        ['Date', 'Description', 'Money out', 'Balance'],
        ['02 Jan 2026', 'TESCO', '12.50', '987.50'],
        ['', 'Brought forward', '', '1,000.00'],
      ],
      1,
      UK,
    )
    expect(sheet.rows[0].map((value) => value.kind)).toEqual([
      'text',
      'text',
      'text',
      'text',
    ])
    expect(sheet.rows[1][0]).toMatchObject({ kind: 'date', value: 46024 })
    expect(sheet.rows[1][3]).toEqual({
      kind: 'number',
      value: 987.5,
      format: '#,##0.00',
    })
    expect(sheet.rows[2][0]).toEqual({ kind: 'empty' })
    expect(sheet.widths[1]).toBeGreaterThanOrEqual('Brought forward'.length)
  })

  it('gives sheets names Excel accepts', () => {
    expect(
      sheetNames(['Page 1', 'Page 1', 'a/b:c', 'x'.repeat(40), "'quoted'"]),
    ).toEqual(['Page 1', 'Page 1 (2)', 'a b c', 'x'.repeat(31), 'quoted'])
  })
})

describe('the .xlsx file', () => {
  const file = writeXlsx([
    sheetOf(
      'Pages 1–2',
      [
        ['Region', '2025', null, 'Note'],
        ['North', '1,200', '(45)', 'Fish & <chips> "ok"\u0007'],
        ['South', '980', '12.5%', ''],
      ],
      1,
      UK,
    ),
    sheetOf(
      'Page 3',
      [
        ['A', 'B'],
        ['x', '£1.00'],
      ],
      1,
      UK,
    ),
  ])
  const files = parts(file)

  it('has a workbook, sheets and styles, and nothing about anyone', () => {
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/app.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ])
    expect(files['docProps/app.xml']).toContain(
      '<Application>Tuls</Application>',
    )
    expect(files['xl/workbook.xml']).toContain('name="Pages 1–2"')
    expect(files['xl/workbook.xml']).toContain('name="Page 3"')
  })

  it('writes numbers as numbers, text as text, and merges', () => {
    const sheet = files['xl/worksheets/sheet1.xml']
    expect(sheet).toContain('<v>1200</v>')
    expect(sheet).toContain('<v>-45</v>')
    expect(sheet).toContain('<v>0.125</v>')
    expect(sheet).toContain(
      '<t xml:space="preserve">Fish &amp; &lt;chips&gt; &quot;ok&quot;</t>',
    )
    expect(sheet).toContain('<mergeCell ref="B1:C1"/>')
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">')
    expect(sheet).toContain('state="frozen"')
  })

  it('has a row height, which Apple’s previews need', () => {
    expect(files['xl/worksheets/sheet1.xml']).toContain(
      '<sheetFormatPr defaultRowHeight="15"/>',
    )
  })

  it('keeps the parts in the order Excel expects', () => {
    const sheet = files['xl/worksheets/sheet1.xml']
    const order = [
      '<dimension',
      '<sheetViews',
      '<sheetFormatPr',
      '<cols',
      '<sheetData',
      '<mergeCells',
      '<pageMargins',
    ].map((tag) => sheet.indexOf(tag))
    expect(order.every((at) => at > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('gives each number format its own style', () => {
    const styles = files['xl/styles.xml']
    expect(styles).toContain('formatCode="#,##0"')
    expect(styles).toContain('formatCode="&quot;£&quot;0.00"')
    expect(styles).toContain(
      '<cellStyle name="Normal" xfId="0" builtinId="0"/>',
    )
  })

  it('copes with hundreds of thousands of rows', () => {
    const rows = Array.from({ length: 300_000 }, (_, i) => [`${i}`, 'x'])
    const sheet = sheetOf('Big', [['n', 'x'], ...rows], 1, UK)
    expect(sheet.widths).toEqual([14, 6])
    expect(writeXlsx([sheet]).byteLength).toBeGreaterThan(0)
  }, 30_000)

  it('comes out the same each time', () => {
    const again = writeXlsx([
      sheetOf(
        'Page 3',
        [
          ['A', 'B'],
          ['x', '£1.00'],
        ],
        1,
        UK,
      ),
    ])
    const once = writeXlsx([
      sheetOf(
        'Page 3',
        [
          ['A', 'B'],
          ['x', '£1.00'],
        ],
        1,
        UK,
      ),
    ])
    expect(again).toEqual(once)
  })
})
