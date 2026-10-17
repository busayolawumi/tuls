import { strToU8, zipSync } from 'fflate'

// Small Excel and PowerPoint files, made in the test (no personal files):
// just the parts Office and LibreOffice need, with things a conversion must
// get right, like a hidden sheet or slide and an author to remove.

const RELS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PACKAGE = 'http://schemas.openxmlformats.org/package/2006'
const TYPE = 'application/vnd.openxmlformats-officedocument'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

function zip(name: string, mimeType: string, files: Record<string, string>) {
  return {
    name,
    mimeType,
    buffer: Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([path, text]) => [
            path,
            strToU8(XML + text),
          ]),
        ),
      ),
    ),
  }
}

const core = `<cp:coreProperties xmlns:cp="${PACKAGE}/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Secret title</dc:title><dc:creator>Ada Example</dc:creator></cp:coreProperties>`
const relationships = (links: [string, string, string][]) =>
  `<Relationships xmlns="${PACKAGE}/relationships">${links
    .map(
      ([id, type, target]) =>
        `<Relationship Id="${id}" Type="${type.startsWith('http') ? type : `${RELS}/${type}`}" Target="${target}"/>`,
    )
    .join('')}</Relationships>`
const rootRels = (main: string) =>
  relationships([
    ['rId1', 'officeDocument', main],
    [
      'rId2',
      `${PACKAGE}/relationships/metadata/core-properties`,
      'docProps/core.xml',
    ],
  ])
const contentTypes = (overrides: [string, string][]) =>
  `<Types xmlns="${PACKAGE}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides
    .map(
      ([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`,
    )
    .join(
      '',
    )}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`

/** Excel's serial number for a date (days since 30 December 1899). */
export const excelDate = (year: number, month: number, day: number) =>
  (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000

/**
 * A workbook: a "Totals" sheet in Aptos Narrow (Excel's default font) with
 * no paper size, a date in Excel's "short date" format and a number, and a
 * hidden sheet saying HiddenSheetSecret.
 */
export function makeXlsx(name: string) {
  const SHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const cell = (ref: string, text: string) =>
    `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
  return zip(name, `${TYPE}.spreadsheetml.sheet`, {
    '[Content_Types].xml': contentTypes([
      ['/xl/workbook.xml', `${TYPE}.spreadsheetml.sheet.main+xml`],
      ['/xl/worksheets/sheet1.xml', `${TYPE}.spreadsheetml.worksheet+xml`],
      ['/xl/worksheets/sheet2.xml', `${TYPE}.spreadsheetml.worksheet+xml`],
      ['/xl/styles.xml', `${TYPE}.spreadsheetml.styles+xml`],
    ]),
    '_rels/.rels': rootRels('xl/workbook.xml'),
    'docProps/core.xml': core,
    'xl/workbook.xml': `<workbook xmlns="${SHEET}" xmlns:r="${RELS}"><sheets><sheet name="Totals" sheetId="1" r:id="rId1"/><sheet name="Secret" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': relationships([
      ['rId1', 'worksheet', 'worksheets/sheet1.xml'],
      ['rId2', 'worksheet', 'worksheets/sheet2.xml'],
      ['rId3', 'styles', 'styles.xml'],
    ]),
    'xl/styles.xml': `<styleSheet xmlns="${SHEET}"><fonts count="1"><font><sz val="11"/><name val="Aptos Narrow"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${SHEET}"><cols><col min="1" max="2" width="16" customWidth="1"/></cols><sheetData><row r="1">${cell('A1', 'Due')}<c r="B1" s="1"><v>${excelDate(2026, 3, 4)}</v></c></row><row r="2">${cell('A2', 'Total')}<c r="B2"><v>1234.5</v></c></row></sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': `<worksheet xmlns="${SHEET}"><sheetData><row r="1">${cell('A1', 'HiddenSheetSecret')}</row></sheetData></worksheet>`,
  })
}

/** A slide's text, and the font it asks for (the theme's if none). */
export type SlideText = string | { text: string; font: string; bold?: true }

/**
 * A 16:9 deck with a slide for each of `texts`; the one saying
 * HiddenSlideSecret is hidden.
 */
export function makePptx(name: string, slides: SlideText[]) {
  const texts = slides.map((slide) =>
    typeof slide === 'string' ? { text: slide } : slide,
  )
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const ns = `xmlns:a="${A}" xmlns:r="${RELS}" xmlns:p="${P}"`
  const tree = (shapes = '') =>
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld>`
  const textBox = ({ text, font, bold }: Exclude<SlideText, string>) =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="9144000" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="4000"${bold ? ' b="1"' : ''}>${font ? `<a:latin typeface="${font}"/>` : ''}</a:rPr><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
  const colour = (name: string, hex: string) =>
    `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  const line = `<a:ln w="9525">${fill}</a:ln>`
  const theme = `<a:theme xmlns:a="${A}" name="Plain"><a:themeElements><a:clrScheme name="Plain">${colour('dk1', '000000')}${colour('lt1', 'FFFFFF')}${colour('dk2', '1F2937')}${colour('lt2', 'F3F4F6')}${colour('accent1', 'EA580C')}${colour('accent2', '2563EB')}${colour('accent3', '16A34A')}${colour('accent4', '9333EA')}${colour('accent5', 'DC2626')}${colour('accent6', '0891B2')}${colour('hlink', '2563EB')}${colour('folHlink', '7C3AED')}</a:clrScheme><a:fontScheme name="Plain"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Plain"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${line}${line}${line}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
  const files: Record<string, string> = {
    '[Content_Types].xml': contentTypes([
      ['/ppt/presentation.xml', `${TYPE}.presentationml.presentation.main+xml`],
      [
        '/ppt/slideMasters/slideMaster1.xml',
        `${TYPE}.presentationml.slideMaster+xml`,
      ],
      [
        '/ppt/slideLayouts/slideLayout1.xml',
        `${TYPE}.presentationml.slideLayout+xml`,
      ],
      ['/ppt/theme/theme1.xml', `${TYPE}.theme+xml`],
      ...texts.map((_, i): [string, string] => [
        `/ppt/slides/slide${i + 1}.xml`,
        `${TYPE}.presentationml.slide+xml`,
      ]),
    ]),
    '_rels/.rels': rootRels('ppt/presentation.xml'),
    'docProps/core.xml': core,
    'ppt/presentation.xml': `<p:presentation ${ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${texts
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`)
      .join(
        '',
      )}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': relationships([
      ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
      ['rId2', 'theme', 'theme/theme1.xml'],
      ...texts.map((_, i): [string, string, string] => [
        `rId${i + 3}`,
        'slide',
        `slides/slide${i + 1}.xml`,
      ]),
    ]),
    'ppt/slideMasters/slideMaster1.xml': `<p:sldMaster ${ns}>${tree()}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': relationships([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'theme', '../theme/theme1.xml'],
    ]),
    'ppt/slideLayouts/slideLayout1.xml': `<p:sldLayout ${ns}>${tree()}</p:sldLayout>`,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': relationships([
      ['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml'],
    ]),
    'ppt/theme/theme1.xml': theme,
  }
  for (const [i, slide] of texts.entries()) {
    const hidden = slide.text === 'HiddenSlideSecret' ? ' show="0"' : ''
    files[`ppt/slides/slide${i + 1}.xml`] =
      `<p:sld ${ns}${hidden}>${tree(textBox({ font: '', ...slide }))}</p:sld>`
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = relationships([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
    ])
  }
  return zip(name, `${TYPE}.presentationml.presentation`, files)
}
