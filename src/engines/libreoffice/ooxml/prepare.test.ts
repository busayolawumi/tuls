import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { engineFontMetrics } from '../../../../plugins/libreoffice.ts'
import { prepareOffice } from './prepare'

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const styles = `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`
const document = `<w:document ${W}><w:body><w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">Heading${' '.repeat(200)}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:left="1440" w:right="1440" w:top="1440" w:bottom="1440" w:gutter="0"/></w:sectPr></w:body></w:document>`
const settings = (compat: string) =>
  `<w:settings ${W}><w:defaultTabStop w:val="720"/>${compat}</w:settings>`
// A stand-in for a picture: bytes that must come through untouched.
const picture = new Uint8Array(500).map((_, i) => (i * 37) % 256)

function docx(settingsXml: string) {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(styles),
    'word/settings.xml': strToU8(settingsXml),
    'word/media/image1.png': picture,
  })
}

describe('preparing an Office file for LibreOffice', () => {
  it('leaves a document without the setting untouched, unopened', async () => {
    let measured = false
    const result = await prepareOffice(docx(settings('')), async () => {
      measured = true
      return engineFontMetrics()
    })
    expect(result).toBeUndefined()
    expect(measured).toBe(false)
  })

  it('changes only the document part when the setting asks for it', async () => {
    const result = await prepareOffice(
      docx(settings('<w:compat><w:ulTrailSpace/></w:compat>')),
      engineFontMetrics,
    )
    expect(result).toBeDefined()
    const files = unzipSync(result!)
    expect(Object.keys(files)).toEqual([
      '[Content_Types].xml',
      'word/document.xml',
      'word/styles.xml',
      'word/settings.xml',
      'word/media/image1.png',
    ])
    expect(files['word/media/image1.png']).toEqual(picture)
    expect(strFromU8(files['word/styles.xml'])).toBe(styles)
    // A4 with 1 inch margins: 9026 twips of text, so a right tab there.
    expect(strFromU8(files['word/document.xml'])).toContain(
      '<w:tabs><w:tab w:val="right" w:pos="9026"/></w:tabs>',
    )
    expect(strFromU8(files['word/document.xml'])).toContain(
      '<w:t xml:space="preserve">Heading</w:t><w:tab/>',
    )
  })
})

describe('charts that ask for capitals', () => {
  const chart = (cap: string) =>
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:plotArea><c:barChart><c:ser><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Facebook</c:v></c:pt><c:pt idx="1"><c:v>R&amp;D</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>740.04</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart><c:catAx><c:txPr><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1197"${cap}/></a:pPr></a:p></c:txPr></c:catAx><c:valAx/></c:plotArea></c:chart></c:chartSpace>`
  const deck = (xml: string) =>
    zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'ppt/charts/chart1.xml': strToU8(xml),
      'ppt/media/image1.png': picture,
    })

  it('capitalises the category labels, as Office shows them', async () => {
    const result = await prepareOffice(deck(chart(' cap="all"')))
    const files = unzipSync(result!)
    const xml = strFromU8(files['ppt/charts/chart1.xml'])
    expect(xml).toContain('<c:v>FACEBOOK</c:v>')
    expect(xml).toContain('<c:v>R&amp;D</c:v>')
    // Values stay as they were.
    expect(xml).toContain('<c:v>740.04</c:v>')
    expect(files['ppt/media/image1.png']).toEqual(picture)
  })

  it('leaves charts that don’t ask for capitals untouched', async () => {
    expect(await prepareOffice(deck(chart('')))).toBeUndefined()
    expect(await prepareOffice(deck(chart(' cap="small"')))).toBeUndefined()
  })
})

describe('chart lines drawn with a gradient', () => {
  const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
  const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
  // Text colour at 42% to background colour at 36%: in a dark deck, text
  // is the light colour.
  const gradient =
    '<a:gradFill><a:gsLst><a:gs pos="0"><a:schemeClr val="tx1"><a:alpha val="42000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="bg1"><a:alpha val="36000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>'
  const chart = `<c:chartSpace ${C} ${A}><c:chart><c:plotArea><c:valAx><c:majorGridlines><c:spPr><a:ln w="9525">${gradient}</a:ln></c:spPr></c:majorGridlines></c:valAx></c:plotArea></c:chart><c:spPr>${gradient}<a:ln w="9525"/></c:spPr></c:chartSpace>`
  const theme = (dark: string, light: string) =>
    `<a:theme ${A}><a:themeElements><a:clrScheme name="T"><a:dk1><a:srgbClr val="${dark}"/></a:dk1><a:lt1><a:srgbClr val="${light}"/></a:lt1></a:clrScheme></a:themeElements></a:theme>`
  const rels = (...links: [string, string][]) =>
    `<Relationships>${links.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`
  // Slide 1 → layout → master → theme1, a dark master. theme2 belongs to
  // the notes and must not be used.
  const deck = zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'ppt/slides/slide1.xml': strToU8('<p:sld/>'),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(
      rels(
        ['slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['chart', '../charts/chart1.xml'],
      ),
    ),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(
      rels(['slideMaster', '../slideMasters/slideMaster1.xml']),
    ),
    'ppt/slideMasters/slideMaster1.xml': strToU8(
      '<p:sldMaster><p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/></p:sldMaster>',
    ),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(
      rels(['theme', '/ppt/theme/theme1.xml']),
    ),
    'ppt/theme/theme1.xml': strToU8(theme('102030', 'F0F0F0')),
    'ppt/theme/theme2.xml': strToU8(theme('FF0000', '00FF00')),
    'ppt/charts/chart1.xml': strToU8(chart),
    'ppt/media/image1.png': picture,
  })

  it('draws them in the average colour, from the slide’s theme', async () => {
    const files = unzipSync((await prepareOffice(deck))!)
    const xml = strFromU8(files['ppt/charts/chart1.xml'])
    // Text F0F0F0 at 42% and background 102030 at 36%: red is
    // (0.42 × 240 + 0.36 × 16) / 0.78 = 137 (89), at 39%.
    expect(xml).toContain(
      '<a:ln w="9525"><a:solidFill><a:srgbClr val="899097"><a:alpha val="39000"/></a:srgbClr></a:solidFill></a:ln>',
    )
    // The chart's background gradient isn't a line, and stays.
    expect(xml).toContain(`<c:spPr>${gradient}<a:ln w="9525"/></c:spPr>`)
    expect(files['ppt/media/image1.png']).toEqual(picture)
  })

  it('uses a Word document’s one theme', async () => {
    const files = unzipSync(
      (await prepareOffice(
        zipSync({
          'word/document.xml': strToU8('<w:document/>'),
          'word/theme/theme1.xml': strToU8(theme('000000', 'FFFFFF')),
          'word/charts/chart1.xml': strToU8(chart),
        }),
      ))!,
    )
    expect(strFromU8(files['word/charts/chart1.xml'])).toContain(
      // Black at 42% and white at 36%: 0.36 × 255 / 0.78 = 118 (76).
      '<a:srgbClr val="767676"><a:alpha val="39000"/></a:srgbClr>',
    )
  })

  it('leaves them alone when it can’t tell their colours', async () => {
    // No theme to be found: the chart isn't on any slide.
    const lost = zipSync({
      'ppt/theme/theme1.xml': strToU8(theme('000000', 'FFFFFF')),
      'ppt/charts/chart1.xml': strToU8(chart),
    })
    expect(await prepareOffice(lost)).toBeUndefined()
  })
})
