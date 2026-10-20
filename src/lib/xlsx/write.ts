import { strToU8, zipSync, type Zippable } from 'fflate'
import { cellRef, widest, type Sheet } from './sheet'

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const DOC_RELS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const TYPES = 'application/vnd.openxmlformats-officedocument'
const TOP = '<alignment vertical="top"/>'
const FIRST_FORMAT = 3
const PAPER = { a4: 9, letter: 1 }

function allowed(char: string) {
  const code = char.codePointAt(0)!
  if (code >= 0xd800 && code <= 0xdfff) return false
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code !== 0xfffe && code !== 0xffff)
  )
}

function escape(text: string) {
  return [...text]
    .filter(allowed)
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Excel's rules for sheet names: 31 characters, none of []:*?/\, unique. */
export function sheetNames(wanted: string[]) {
  const used = new Set<string>()
  return wanted.map((name) => {
    const base =
      name
        .replace(/[[\]:*?/\\]/g, ' ')
        .replace(/^'|'$/g, '')
        .trim() || 'Sheet'
    let candidate = base.slice(0, 31)
    for (let n = 2; used.has(candidate.toLowerCase()); n++) {
      const suffix = ` (${n})`
      candidate = base.slice(0, 31 - suffix.length) + suffix
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

/** Number formats, each given an id from 164 up, as Excel numbers its own. */
function formatIds(sheets: Sheet[]) {
  const ids = new Map<string, number>()
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const value of row) {
        if (
          (value.kind === 'number' || value.kind === 'date') &&
          !ids.has(value.format)
        ) {
          ids.set(value.format, 164 + ids.size)
        }
      }
    }
  }
  return ids
}

// Styles: 0 plain, 1 bold heading, 2 wrapped text, then one per number
// format. Everything sits at the top, which only shows in tall rows.
function styles(ids: Map<string, number>) {
  const formats = [...ids]
    .map(
      ([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escape(code)}"/>`,
    )
    .join('')
  const xfs = [...ids.values()]
    .map(
      (id) =>
        `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1">${TOP}</xf>`,
    )
    .join('')
  return (
    `${XML}<styleSheet xmlns="${MAIN}">` +
    (ids.size ? `<numFmts count="${ids.size}">${formats}</numFmts>` : '') +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0">${TOP}</xf></cellStyleXfs>` +
    `<cellXfs count="${FIRST_FORMAT + ids.size}">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">${TOP}</xf>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">${TOP}</xf>` +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    `${xfs}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>'
  )
}

function worksheet(
  sheet: Sheet,
  ids: Map<string, number>,
  styleOf: Map<number, number>,
) {
  const columns = Math.max(1, widest(sheet.rows))
  const last = cellRef(Math.max(0, sheet.rows.length - 1), columns - 1)
  const pane = sheet.header
    ? `<pane ySplit="${sheet.header}" topLeftCell="${cellRef(sheet.header, 0)}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="${cellRef(sheet.header, 0)}" sqref="${cellRef(sheet.header, 0)}"/>`
    : ''
  const rows = sheet.rows
    .map((row, r) => {
      const heading = r < sheet.header
      const cells = row
        .map((value, c) => {
          const at = cellRef(r, c)
          if (value.kind === 'empty')
            return heading ? `<c r="${at}" s="1"/>` : ''
          if (value.kind === 'text') {
            const style = heading ? ' s="1"' : sheet.wrap?.[c] ? ' s="2"' : ''
            return `<c r="${at}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(value.text)}</t></is></c>`
          }
          const style = styleOf.get(ids.get(value.format)!)
          return `<c r="${at}" s="${style}"><v>${value.value}</v></c>`
        })
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const cols = sheet.widths
    .map(
      (width, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('')
  const print = sheet.print
  const setup = print
    ? `<pageSetup paperSize="${PAPER[print.paper]}" orientation="${print.landscape ? 'landscape' : 'portrait'}"` +
      (print.fit
        ? ' fitToWidth="1" fitToHeight="0"'
        : ` scale="${print.scale}"`) +
      '/>'
    : ''
  return (
    `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${DOC_RELS}">` +
    (print?.fit ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '') +
    `<dimension ref="A1:${last}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    // Without a row height, Apple's previews (Files, Quick Look) draw rows
    // with no height at all.
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows}</sheetData>` +
    (sheet.merges.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
      : '') +
    (print ? '<printOptions gridLines="1"/>' : '') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    setup +
    '</worksheet>'
  )
}

/** Rows (and the first column) repeated on every printed page. */
function printTitles(sheets: Sheet[], names: string[]) {
  const titles = sheets
    .map((sheet, i) => {
      if (!sheet.print) return ''
      const name = `'${names[i].replace(/'/g, "''")}'`
      const ranges = [
        sheet.print.repeatFirstColumn ? `${name}!$A:$A` : '',
        sheet.header ? `${name}!$1:$${sheet.header}` : '',
      ].filter(Boolean)
      return ranges.length
        ? `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${escape(ranges.join(','))}</definedName>`
        : ''
    })
    .join('')
  return titles ? `<definedNames>${titles}</definedNames>` : ''
}

/** An .xlsx file of the sheets, with no author or other details. */
export function writeXlsx(sheets: Sheet[]): Uint8Array<ArrayBuffer> {
  const ids = formatIds(sheets)
  const styleOf = new Map(
    [...ids.values()].map((id, i) => [id, FIRST_FORMAT + i]),
  )
  const names = sheetNames(sheets.map((sheet) => sheet.name))
  const files: Zippable = {
    '[Content_Types].xml': strToU8(
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/xl/workbook.xml" ContentType="${TYPES}.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="${TYPES}.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/app.xml" ContentType="${TYPES}.extended-properties+xml"/>` +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${TYPES}.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `${XML}<Relationships xmlns="${RELS}">` +
        `<Relationship Id="rId1" Type="${DOC_RELS}/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="${DOC_RELS}/extended-properties" Target="docProps/app.xml"/>` +
        '</Relationships>',
    ),
    'docProps/app.xml': strToU8(
      `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Tuls</Application></Properties>`,
    ),
    'xl/workbook.xml': strToU8(
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${DOC_RELS}"><sheets>` +
        names
          .map(
            (name, i) =>
              `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('') +
        '</sheets>' +
        printTitles(sheets, names) +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${XML}<Relationships xmlns="${RELS}">` +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${DOC_RELS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${DOC_RELS}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(styles(ids)),
  }
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      worksheet(sheet, ids, styleOf),
    )
  })
  return zipSync(files, { level: 6, mtime: new Date(1980, 0, 1, 12) })
}
