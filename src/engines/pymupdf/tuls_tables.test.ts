import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadPython, PYMUPDF_ONLY, type Python } from './python.node-testing'

type Table = { pages: number[]; rows: (string | null)[][]; header: number }

let python: Python

beforeAll(async () => {
  python = await loadPython(PYMUPDF_ONLY, [
    'tuls_text_map.py',
    'tuls_tables.py',
  ])
  const here = dirname(fileURLToPath(import.meta.url))
  python.globals.get('configure_ligatures')(
    readFileSync(join(here, 'officeFonts.json'), 'utf8'),
  )
  python.runPython(`
import pymupdf

def write(page, x, y, text, right=False, size=9, font='helv'):
    if right:
        x -= pymupdf.get_text_length(text, fontname=font, fontsize=size)
    page.insert_text((x, y), text, fontname=font, fontsize=size)

def rows_at(page, rows, columns, y, step=14, size=9):
    """columns: (x, right-aligned) for each column."""
    for row in rows:
        for (x, right), text in zip(columns, row):
            if text:
                write(page, x, y, text, right, size)
        y += step
    return y

STATEMENT = [(50, False), (120, False), (420, True), (490, True), (560, True)]
`)
}, 60_000)

function tables(code: string): { tables: Table[]; pages: number } {
  python.runPython(code)
  return JSON.parse(String(python.globals.get('tables')('/in.pdf')))
}

describe('tables without lines', () => {
  it('reads a statement over two pages as one table', () => {
    const { tables: found, pages } = tables(`
doc = pymupdf.open()
head = ['Date', 'Description', 'Money out', 'Money in', 'Balance']
for n, body in enumerate([
    [['', 'Balance brought forward', '', '', '1,000.00'],
     ['02 Jan 2026', 'TESCO STORES', '12.50', '', '987.50'],
     ['03 Jan 2026', 'SALARY ACME LTD', '', '2,500.00', '3,487.50'],
     ['', 'JANUARY', '', '', ''],
     ['04 Jan 2026', 'RENT', '900.00', '', '2,587.50']],
    [['05 Jan 2026', 'UBER TRIP', '8.10', '', '2,579.40'],
     ['06 Jan 2026', 'INTEREST', '', '0.42', '2,579.82']]]):
    page = doc.new_page(width=595, height=842)
    write(page, 50, 60, 'Example Bank plc', size=14)
    write(page, 50, 80, 'Account 12345678')
    rows_at(page, [head] + body, STATEMENT, 120)
    write(page, 500, 800, 'Page %d of 2' % (n + 1))
doc.save('/in.pdf')
`)
    expect(pages).toBe(2)
    expect(found).toHaveLength(1)
    expect(found[0].pages).toEqual([1, 2])
    expect(found[0].header).toBe(1)
    expect(found[0].rows).toEqual([
      ['Date', 'Description', 'Money out', 'Money in', 'Balance'],
      ['', 'Balance brought forward', '', '', '1,000.00'],
      ['02 Jan 2026', 'TESCO STORES', '12.50', '', '987.50'],
      ['03 Jan 2026', 'SALARY ACME LTD JANUARY', '', '2,500.00', '3,487.50'],
      ['04 Jan 2026', 'RENT', '900.00', '', '2,587.50'],
      ['05 Jan 2026', 'UBER TRIP', '8.10', '', '2,579.40'],
      ['06 Jan 2026', 'INTEREST', '', '0.42', '2,579.82'],
    ])
  })

  it('joins a heading over two lines', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
y = rows_at(page, [['', '', 'Money', 'Money', ''], ['Date', 'Description', 'out', 'in', 'Balance']], STATEMENT, 100, step=10)
rows_at(page, [
    ['02/01/2026', 'TESCO', '12.50', '', '987.50'],
    ['03/01/2026', 'SALARY', '', '2,500.00', '3,487.50'],
    ['04/01/2026', 'RENT', '900.00', '', '2,587.50']], STATEMENT, y + 6)
doc.save('/in.pdf')
`)
    expect(found).toHaveLength(1)
    expect(found[0].header).toBe(1)
    expect(found[0].rows[0]).toEqual([
      'Date',
      'Description',
      'Money out',
      'Money in',
      'Balance',
    ])
    expect(found[0].rows).toHaveLength(4)
  })

  it('takes numbered headings, such as weeks, as headings', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
cols = [(60, False), (200, True), (280, True), (360, True)]
rows_at(page, [['Team', 'Week 1', 'Week 2', 'Week 3'], ['North', '12', '15', '9'],
    ['South', '8', '11', '14'], ['West', '20', '18', '16']], cols, 100)
doc.save('/in.pdf')
`)
    expect(found).toHaveLength(1)
    expect(found[0].header).toBe(1)
    expect(found[0].rows[0]).toEqual(['Team', 'Week 1', 'Week 2', 'Week 3'])
    expect(found[0].rows[1]).toEqual(['North', '12', '15', '9'])
  })

  it('splits the cells of a dense spreadsheet', () => {
    // As LibreOffice prints a sheet: cells touch, dates and numbers are
    // right-aligned, text and headings left-aligned.
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
names = ['Ada Obi', 'Bo Li', 'Chiamaka Eze', 'Dan', 'Efe Oke', 'Femi Adeyemi']
cats = ['Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5', 'Cat 6']
y = 100
for x, text in zip([50, 112, 176, 250, 300], ['Date', 'Name', 'Region', 'Type', 'Total']):
    write(page, x, y, text)
for i, (name, cat) in enumerate(zip(names, cats)):
    y += 14
    write(page, 110, y, '0%d/01/2026' % (i + 1), right=True)
    write(page, 112, y, name)
    write(page, 176, y, ['North', 'South', 'East'][i % 3])
    write(page, 250, y, cat)
    write(page, 330, y, '%d.50' % (i * 7), right=True)
doc.save('/in.pdf')
`)
    expect(found).toHaveLength(1)
    expect(found[0].rows[0]).toEqual([
      'Date',
      'Name',
      'Region',
      'Type',
      'Total',
    ])
    expect(found[0].rows[1]).toEqual([
      '01/01/2026',
      'Ada Obi',
      'North',
      'Cat 1',
      '0.50',
    ])
    expect(found[0].rows[3]).toEqual([
      '03/01/2026',
      'Chiamaka Eze',
      'East',
      'Cat 3',
      '14.50',
    ])
  })

  it('leaves prose, headings and page numbers alone', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
text = ('This is an ordinary paragraph of a letter, with nothing laid out in '
        'columns at all. It goes on for a few lines, as letters do, and then '
        'it stops. Nothing here should end up in a spreadsheet. ') * 4
page.insert_textbox(pymupdf.Rect(72, 72, 520, 400), text, fontname='helv', fontsize=11)
write(page, 72, 60, 'A letter', size=16)
write(page, 280, 800, 'Page 1')
doc.save('/in.pdf')
`)
    expect(found).toEqual([])
  })

  it('keeps separate tables apart, even with the same heading', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
cols = [(72, False), (250, True), (350, True)]
for n in range(3):
    page = doc.new_page()
    if n == 1:
        page.insert_textbox(pymupdf.Rect(72, 72, 520, 300), 'Words between the tables. ' * 20, fontname='helv', fontsize=11)
        continue
    rows_at(page, [['Region', '2025', '2026'], ['North', '1,200', '1,350'], ['South', '980', '1,010'], ['West', '45', '60']], cols, 100)
    rows_at(page, [['Item', 'Qty', 'Cost'], ['Paper', '3', '4.50'], ['Ink', '1', '20.00'], ['Pens', '12', '6.00']], cols, 400)
doc.save('/in.pdf')
`)
    expect(found.map((t) => [t.pages, t.rows.length, t.header])).toEqual([
      [[1], 4, 1],
      [[1], 4, 1],
      [[3], 4, 1],
      [[3], 4, 1],
    ])
  })
})

describe('tables with lines', () => {
  it('marks merged cells, and keeps both heading rows', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
xs = [50, 170, 270, 370, 470]
ys = [100, 120, 140, 160, 180, 200]
for y in ys:
    page.draw_line((xs[0], y), (xs[-1], y))
for x in (xs[0], xs[1], xs[3], xs[4]):
    page.draw_line((x, ys[0]), (x, ys[-1]))
page.draw_line((xs[2], ys[1]), (xs[2], ys[-1]))
cells = [['Region', '2025', None, 'Change'], ['', 'H1', 'H2', ''],
         ['North', '1,200', '1,350', '12.5%'], ['South', '980', '1,010', '3.1%'],
         ['West', '(45)', '-60', 'n/a']]
for r, row in enumerate(cells):
    for c, text in enumerate(row):
        if text:
            write(page, xs[c] + 4, ys[r] + 14, text)
doc.save('/in.pdf')
`)
    expect(found).toHaveLength(1)
    expect(found[0].header).toBe(2)
    expect(found[0].rows).toEqual([
      ['Region', '2025', null, 'Change'],
      ['', 'H1', 'H2', ''],
      ['North', '1,200', '1,350', '12.5%'],
      ['South', '980', '1,010', '3.1%'],
      ['West', '(45)', '-60', 'n/a'],
    ])
  })
})

describe('other PDFs', () => {
  it('finds nothing on a scanned page', () => {
    const { tables: found } = tables(`
doc = pymupdf.open()
page = doc.new_page()
pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 200, 200), False)
pix.clear_with(200)
page.insert_image(page.rect, pixmap=pix)
doc.save('/in.pdf')
`)
    expect(found).toEqual([])
  })

  it('reads a landscape page turned upright', () => {
    const { tables: found } = tables(`
land = pymupdf.open()
page = land.new_page(width=842, height=595)
rows_at(page, [['Item', 'Qty', 'Cost'], ['Paper', '3', '4.50'], ['Ink', '1', '20.00'], ['Pens', '12', '6.00']], [(72, False), (250, True), (350, True)], 100)
doc = pymupdf.open()
page = doc.new_page(width=595, height=842)
page.show_pdf_page(page.rect, land, 0, rotate=90)
page.set_rotation(90)
doc.save('/in.pdf')
`)
    expect(found).toHaveLength(1)
    expect(found[0].rows[1]).toEqual(['Paper', '3', '4.50'])
  })

  it('refuses a PDF that needs a password', () => {
    expect(() =>
      tables(`
doc = pymupdf.open()
doc.new_page().insert_text((72, 72), 'Secret')
doc.save('/in.pdf', encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw='pw', owner_pw='pw')
`),
    ).toThrow(/password/)
  })
})
