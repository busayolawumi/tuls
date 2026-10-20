import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { TINY_JPEG } from '../../lib/images.testing'
import { ALL_WHEELS, loadPython, type Python } from './python.node-testing'

// tuls_pdf2docx.py, run in the PDF to Word engine's own Python (Pyodide,
// PyMuPDF and pdf2docx: the files the browser loads), on PDFs made here with
// PyMuPDF.

async function loadPdf2docx() {
  const python = await loadPython(ALL_WHEELS, ['tuls_pdf2docx.py'])
  const here = dirname(fileURLToPath(import.meta.url))
  python.globals.get('configure')(
    readFileSync(join(here, 'officeFonts.json'), 'utf8'),
  )
  return python
}

let python: Python
const run = (code: string) => python.runPython(code) as string

/** Converts the PDF a Python snippet saved at /in.pdf; the .docx's parts. */
function convert() {
  const result = JSON.parse(
    String(python.globals.get('convert')('/in.pdf', '/out.docx')),
  ) as { leftOut: number[] }
  const parts = unzipSync(python.FS.readFile('/out.docx'))
  const xml = (name: string) => (parts[name] ? strFromU8(parts[name]) : '')
  // Text, with tabs as \t.
  const text = (name: string) =>
    [...xml(name).matchAll(/<w:tab\/>|<w:t(?:\s[^>]*)?>([^<]*)/g)]
      .map((m) => m[1] ?? '\t')
      .join('')
  return { result, parts, xml, text }
}

beforeAll(async () => {
  python = await loadPdf2docx()
}, 60_000)

describe('font names, as Word knows them', () => {
  it('turns PDF and PostScript names into families', () => {
    const cases: Record<string, string> = {
      'ABCDEF+ArialMT': 'Arial',
      'Arial-BoldMT': 'Arial',
      'TimesNewRomanPS-BoldItalicMT': 'Times New Roman',
      'Times-Roman': 'Times New Roman',
      CourierNewPSMT: 'Courier New',
      SymbolMT: 'Symbol',
      'Wingdings-Regular': 'Wingdings',
      'Calibri,Bold': 'Calibri',
      'Calibri-Light': 'Calibri Light',
      'SegoeUI-Semibold': 'Segoe UI Semibold',
      TrebuchetMS: 'Trebuchet MS',
      'ArialNarrow-Bold': 'Arial Narrow',
      'OpenSans-SemiBoldItalic': 'Open Sans SemiBold',
      'PTSans-Regular': 'PT Sans',
      GillSansMT: 'Gill Sans MT',
    }
    for (const [name, family] of Object.entries(cases)) {
      expect(run(`family_name(${JSON.stringify(name)})`), name).toBe(family)
    }
  })
})

describe('repairing a PDF’s text map', () => {
  it('reads every kind of text map entry', () => {
    const cmap = `begincodespacerange <00> <FF> endcodespacerange
      2 beginbfchar <21> <0041> <4F> <FB01> endbfchar
      2 beginbfrange <30> <32> <0061> <40> <41> [<0078> <00660069>] endbfrange`
    run(`codes, length = parse_cmap(${JSON.stringify(cmap)})`)
    expect(run('length')).toBe(1)
    expect(
      JSON.parse(run('json.dumps({str(k): v for k, v in codes.items()})')),
    ).toEqual({
      '33': 'A',
      '79': 'ﬁ',
      '48': 'a',
      '49': 'b',
      '50': 'c',
      '64': 'x',
      '65': 'fi',
    })
  })

  it('names Calibri ligatures the text map left out, by their width', () => {
    // "Evaluation" set in a font called Calibri, its "ti" drawn with code
    // 0x37, which the text map leaves out: readers fall back to "7".
    run(`
import fitz
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 72), "Evalua7on and Ba>le", fontname="helv", fontsize=11)
font = [x for x in range(1, doc.xref_length()) if doc.xref_get_key(x, 'Type')[1] == '/Font'][0]
entries = ''.join('<%02X> <%04X>\\n' % (c, c) for c in range(32, 127) if c not in (0x37, 0x3E))
cmap = '/CIDInit /ProcSet findresource begin begincmap 1 begincodespacerange <00> <FF> endcodespacerange %d beginbfchar\\n%sendbfchar endcmap end' % (95 - 2, entries)
stream = doc.get_new_xref()
doc.update_object(stream, '<< >>')
doc.update_stream(stream, cmap.encode())
widths = [500] * 95
widths[0x37 - 32] = 557   # Calibri's ti
widths[0x3E - 32] = 634   # Calibri's tt
doc.xref_set_key(font, 'BaseFont', '/AAAAAC+Calibri')
doc.xref_set_key(font, 'ToUnicode', '%d 0 R' % stream)
doc.xref_set_key(font, 'FirstChar', '32')
doc.xref_set_key(font, 'LastChar', '126')
doc.xref_set_key(font, 'Widths', '[%s]' % ' '.join(map(str, widths)))
before = fitz.open(stream=doc.tobytes())[0].get_text().strip()
added = repair_text_map(doc)
after = fitz.open(stream=doc.tobytes())[0].get_text().strip()
`)
    expect(run('before')).toBe('Evalua7on and Ba>le')
    expect(run('str(added)')).toBe('2')
    expect(run('after')).toBe('Evaluation and Battle')
  })

  it('leaves fonts it doesn’t know, and complete text maps, alone', () => {
    run(`
doc2 = fitz.open()
doc2.new_page().insert_text((72, 72), "Plain 7 > text", fontname="helv")
untouched = repair_text_map(doc2)
`)
    expect(run('str(untouched)')).toBe('0')
  })
})

describe('converting', () => {
  it('moves a running footer into Word’s footers, page by page', () => {
    run(`
doc = fitz.open()
for n in range(1, 4):
    page = doc.new_page(width=612, height=792)
    for line in range(30):
        page.insert_text((72, 90 + line * 14), 'Line %d of the report body on page %d.' % (line + 1, n), fontname='tiro', fontsize=11)
    page.insert_text((72, 760), 'Acme Report', fontname='helv', fontsize=9)
    page.insert_text((480, 760), 'Page %d of 3' % n, fontname='helv', fontsize=9)
doc.save('/in.pdf')
`)
    const { result, parts, xml, text } = convert()
    expect(result.leftOut).toEqual([])
    const footers = Object.keys(parts)
      .filter((name) => /^word\/footer\d+\.xml$/.test(name))
      .map(text)
      .filter((t) => t.includes('Acme'))
    expect(footers.sort()).toEqual([
      'Acme Report\tPage 1 of 3',
      'Acme Report\tPage 2 of 3',
      'Acme Report\tPage 3 of 3',
    ])
    // Not in the pages themselves any more; the body still is.
    const body = text('word/document.xml')
    expect(body).not.toContain('Acme Report')
    expect(body).toContain('Line 30 of the report body on page 3.')
    // Times-Roman is Times New Roman to Word, and lines are single spaced:
    // 14 pt apart is about Times New Roman's own 1.15 × 11 pt, with leading.
    expect(xml('word/document.xml')).toContain('w:ascii="Times New Roman"')
    expect(xml('word/document.xml')).not.toContain('w:ascii=""')
    // The section breaks at the ends of pages take no room.
    expect(xml('word/document.xml')).toMatch(
      /<w:spacing w:before="0" w:after="0" w:line="14" w:lineRule="exact"\/><w:rPr><w:sz w:val="2"\/><\/w:rPr><w:sectPr/,
    )
  }, 60_000)

  it('leaves headings at the tops of pages in the pages', () => {
    run(`
doc = fitz.open()
for n in range(1, 4):
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 60), 'Chapter %d' % (n * 2), fontname='hebo', fontsize=18)
    for line in range(20):
        page.insert_text((72, 100 + line * 14), 'Body text, line %d.' % (line + 1), fontname='helv', fontsize=11)
doc.save('/in.pdf')
`)
    const { text } = convert()
    expect(text('word/document.xml')).toContain('Chapter 4')
  }, 60_000)

  it('leaves a footer inside a box drawn round the page where it is', () => {
    run(`
doc = fitz.open()
for n in range(1, 4):
    page = doc.new_page(width=612, height=792)
    page.draw_rect(fitz.Rect(30, 30, 582, 770), color=(0, 0, 0), width=1)
    page.insert_text((72, 90), 'Boxed page %d.' % n, fontname='helv', fontsize=11)
    page.insert_text((72, 755), 'Form footer, page %d' % n, fontname='helv', fontsize=9)
doc.save('/in.pdf')
`)
    const { text } = convert()
    expect(text('word/document.xml')).toContain('Form footer, page 2')
  }, 60_000)

  it('keeps a JPEG as it is, rather than making it a PNG', () => {
    python.FS.writeFile('/photo.jpg', TINY_JPEG)
    run(`
doc = fitz.open()
page = doc.new_page()
page.insert_text((72, 72), 'A photo:', fontname='helv')
page.insert_image(fitz.Rect(72, 100, 272, 200), filename='/photo.jpg')
doc.save('/in.pdf')
`)
    const { parts } = convert()
    const media = Object.keys(parts).filter((name) =>
      name.startsWith('word/media/'),
    )
    expect(media).toEqual([expect.stringMatching(/\.jpe?g$/)])
    expect(parts[media[0]]).toEqual(TINY_JPEG)
  }, 60_000)

  it('gives tables their columns’ real widths, and rows that grow', () => {
    run(`
doc = fitz.open()
page = doc.new_page()
for row in range(3):
    y = 100 + row * 20
    page.draw_rect(fitz.Rect(72, y, 372, y + 20), color=(0, 0, 0), width=0.75)
    page.draw_rect(fitz.Rect(372, y, 472, y + 20), color=(0, 0, 0), width=0.75)
    page.insert_text((76, y + 14), 'Task number %d' % (row + 1), fontname='helv', fontsize=10)
    page.insert_text((376, y + 14), 'Due', fontname='helv', fontsize=10)
doc.save('/in.pdf')
`)
    const { xml } = convert()
    const doc = xml('word/document.xml')
    const grid = [...doc.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      Number(m[1]),
    )
    // 300 pt and 100 pt, in twentieths of a point.
    expect(grid).toHaveLength(2)
    expect(Math.abs(grid[0] - 6000)).toBeLessThan(60)
    expect(Math.abs(grid[1] - 2000)).toBeLessThan(60)
    expect(doc).not.toContain('w:hRule="exact"')
    expect(doc).toContain('w:hRule="atLeast"')
  }, 60_000)

  it('marks superscripts as superscripts, at the size of the text around them', () => {
    run(`
import docx as _docx
class Span:
    flags = 1
    size = 7.0
document = _docx.Document()
superscript = document.add_paragraph().add_run('1')
_superscript(Span(), superscript)
`)
    expect(run('str(superscript.font.superscript)')).toBe('True')
    expect(run('str(superscript.font.size.pt)')).toBe('11.0')
  })
})
