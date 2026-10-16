import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { engineFontMetrics } from '../../../../plugins/libreoffice.ts'
import { prepareDocx } from './prepare'

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

describe('preparing a .docx for LibreOffice', () => {
  it('leaves a document without the setting untouched, unopened', async () => {
    let measured = false
    const result = await prepareDocx(docx(settings('')), async () => {
      measured = true
      return engineFontMetrics()
    })
    expect(result).toBeUndefined()
    expect(measured).toBe(false)
  })

  it('changes only the document part when the setting asks for it', async () => {
    const result = await prepareDocx(
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
