import { beforeAll, describe, expect, it } from 'vitest'
import { engineFontMetrics } from '../../../../plugins/libreoffice.ts'
import {
  underlineTrailingSpaces,
  underlinesTrailingSpaces,
  type FontMetrics,
} from './trailingSpaces'
import { attr, children, decodeText, encodeText } from './xml'

let metrics: FontMetrics
beforeAll(async () => {
  metrics = await engineFontMetrics()
})

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const SETTINGS = `<w:settings ${W}><w:defaultTabStop w:val="720"/><w:compat><w:ulTrailSpace/></w:compat></w:settings>`
// Like the CV that showed the problem: Times New Roman, and a heading
// style that's bold and underlined.
const STYLES = `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="165"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:u w:val="single"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Tabbed"><w:basedOn w:val="Heading1"/><w:pPr><w:tabs><w:tab w:val="left" w:pos="4000"/></w:tabs></w:pPr></w:style></w:styles>`
// US Letter with 1 inch margins: 6.5 inches of text, 9360 twips.
const SECTION =
  '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W}><w:body>${body}${SECTION}</w:body></w:document>`
const RUN = '<w:rPr><w:sz w:val="22"/></w:rPr>'
const spaces = (n: number) => ' '.repeat(n)
const heading = (inner: string, pPr = '') =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/>${pPr}<w:spacing w:line="276" w:lineRule="auto"/></w:pPr>${inner}</w:p>`

function fix(body: string, settings = SETTINGS) {
  return underlineTrailingSpaces(doc(body), {
    stylesXml: STYLES,
    settingsXml: settings,
    metrics,
  })
}

/** The paragraphs' tab stops and run contents, after fixing. */
function paragraphs(xml: string) {
  const body = children(
    children(xml).find((e) => e.name === 'w:document')!.inner,
  )[0]
  return children(body.inner)
    .filter((e) => e.name === 'w:p')
    .map((p) => {
      const parts = children(p.inner)
      const pPr = parts.find((e) => e.name === 'w:pPr')
      const tabs = pPr
        ? children(pPr.inner).find((e) => e.name === 'w:tabs')
        : undefined
      return {
        pPrOrder: pPr ? children(pPr.inner).map((e) => e.name) : [],
        tabs: tabs
          ? children(tabs.inner).map(
              (t) => `${attr(t.tag, 'w:val')}@${attr(t.tag, 'w:pos')}`,
            )
          : [],
        runs: parts
          .filter((e) => e.name === 'w:r')
          .map((r) =>
            children(r.inner)
              .filter((c) => c.name !== 'w:rPr')
              .map((c) => (c.name === 'w:tab' ? '→' : decodeText(c.inner)))
              .join(''),
          ),
      }
    })
}

/** A left tab's position in points. */
const points = (tab: string) => Number(tab.split('@')[1]) / 20

describe('underlining trailing spaces as Word does', () => {
  it('ends where Word for Mac ended it, for a heading short of the margin', () => {
    // "EXPERIENCE", a tab and 127 spaces: Word's rule ended at 457.0 pt.
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t>EXPERIENCE</w:t></w:r><w:r>${RUN}<w:tab/><w:t xml:space="preserve">${spaces(94)}</w:t></w:r><w:r>${RUN}<w:t xml:space="preserve">${spaces(33)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['EXPERIENCE', '→'])
    expect(out.tabs).toHaveLength(1)
    expect(out.tabs[0]).toMatch(/^left@/)
    expect(points(out.tabs[0])).toBeCloseTo(457.0, 0)
  })

  it('makes one tab of all the blanks after the text, no-break spaces too', () => {
    // As in the CV: a tab, spaces, four no-break spaces, then more spaces.
    // Word underlines all of it, to 457.0 pt.
    const nbsp = '\u00a0'.repeat(4)
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t>EXPERIENCE</w:t></w:r><w:r>${RUN}<w:tab/><w:t xml:space="preserve">${spaces(79)}${nbsp}${spaces(11)}</w:t></w:r><w:r>${RUN}<w:t xml:space="preserve">${spaces(33)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['EXPERIENCE', '→'])
    expect(out.tabs).toHaveLength(1)
    expect(points(out.tabs[0])).toBeCloseTo(457.0, 0)
  })

  it('keeps the text’s own tabs on the default stops they used', () => {
    // A custom stop turns off the default ones to its left, so the tab
    // between "Name" and "2024" is pinned to its 0.5 inch default stop.
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t>Name</w:t><w:tab/><w:t xml:space="preserve">2024${spaces(200)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['Name→2024→'])
    expect(out.tabs).toEqual(['left@720', 'right@9360'])
  })

  it('leaves alone a no-break space that Word would move to a new line', () => {
    const body = heading(
      `<w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}\u00a0</w:t></w:r>`,
    )
    expect(fix(body)).toBe(doc(body))
  })

  it('counts character spacing, as Word does', () => {
    // "SKILLS" and 141 spaces at -0.1 pt each: Word's rule ended at 412.8 pt.
    const tight = '<w:rPr><w:spacing w:val="-2"/><w:sz w:val="22"/></w:rPr>'
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${tight}<w:t xml:space="preserve">SKILLS${spaces(106)}</w:t></w:r><w:r>${tight}<w:t xml:space="preserve">${spaces(14)}</w:t></w:r><w:r>${tight}<w:t xml:space="preserve">${spaces(21)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['SKILLS→'])
    expect(points(out.tabs[0])).toBeCloseTo(412.8, 0)
  })

  it('stops at the margin with a right-aligned tab when the spaces run past it', () => {
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t>PROFESSIONAL SUMMARY</w:t></w:r><w:r>${RUN}<w:tab/><w:t xml:space="preserve">${spaces(157)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['PROFESSIONAL SUMMARY', '→'])
    expect(out.tabs).toEqual(['right@9360'])
  })

  it('draws a rule for a paragraph of nothing but underlined spaces', () => {
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t xml:space="preserve">${spaces(200)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['→'])
    expect(out.tabs).toEqual(['right@9360'])
  })

  it('clears an inherited tab stop that would catch the tab first', () => {
    const out = paragraphs(
      fix(
        `<w:p><w:pPr><w:pStyle w:val="Tabbed"/></w:pPr><w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}</w:t></w:r></w:p>`,
      ),
    )[0]
    expect(out.tabs).toEqual(['clear@4000', 'right@9360'])
  })

  it('puts the tab stops where they belong among the paragraph properties', () => {
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.pPrOrder).toEqual(['w:pStyle', 'w:tabs', 'w:spacing'])
  })

  it('keeps the text, escaped as it was', () => {
    const out = paragraphs(
      fix(
        heading(
          `<w:r>${RUN}<w:t xml:space="preserve">R&amp;D${spaces(200)}</w:t></w:r>`,
        ),
      ),
    )[0]
    expect(out.runs).toEqual(['R&D→'])
  })
})

describe('leaving paragraphs alone', () => {
  const cases: [string, string][] = [
    [
      'spaces that aren’t underlined',
      `<w:p><w:r><w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr><w:t xml:space="preserve">Plain${spaces(200)}</w:t></w:r></w:p>`,
    ],
    ['no trailing spaces', heading(`<w:r>${RUN}<w:t>SUMMARY</w:t></w:r>`)],
    [
      'a centred paragraph',
      heading(
        `<w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}</w:t></w:r>`,
        '<w:jc w:val="center"/>',
      ),
    ],
    [
      'a numbered paragraph',
      heading(
        `<w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}</w:t></w:r>`,
        '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>',
      ),
    ],
    [
      'a font without known widths',
      heading(
        `<w:r><w:rPr><w:rFonts w:ascii="Georgia"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">A${spaces(200)}</w:t></w:r>`,
      ),
    ],
    [
      'text too long for one line',
      heading(
        `<w:r>${RUN}<w:t xml:space="preserve">${'WORD '.repeat(60)}${spaces(50)}</w:t></w:r>`,
      ),
    ],
    [
      'a link',
      heading(
        `<w:hyperlink><w:r>${RUN}<w:t>Link</w:t></w:r></w:hyperlink><w:r>${RUN}<w:t xml:space="preserve">${spaces(200)}</w:t></w:r>`,
      ),
    ],
    [
      'a picture or break in the text',
      heading(
        `<w:r>${RUN}<w:t>A</w:t><w:br/><w:t xml:space="preserve">${spaces(200)}</w:t></w:r>`,
      ),
    ],
  ]
  for (const [what, body] of cases) {
    it(`leaves ${what} as it is`, () => {
      expect(fix(body)).toBe(doc(body))
    })
  }

  it('changes nothing else in the document', () => {
    const plain = `<w:p><w:r><w:t>Before</w:t></w:r></w:p>`
    const body = `${plain}\n${heading(`<w:r>${RUN}<w:t xml:space="preserve">A${spaces(200)}</w:t></w:r>`)}\n${plain}`
    const out = fix(body)
    expect(out.startsWith(doc(plain).split(plain)[0] + plain + '\n')).toBe(true)
    expect(out.endsWith(`\n${plain}${SECTION}</w:body></w:document>`)).toBe(
      true,
    )
  })
})

describe('the setting', () => {
  it('is read from the compatibility settings', () => {
    expect(underlinesTrailingSpaces(SETTINGS)).toBe(true)
    expect(
      underlinesTrailingSpaces(
        `<w:settings ${W}><w:compat><w:ulTrailSpace w:val="0"/></w:compat></w:settings>`,
      ),
    ).toBe(false)
    expect(underlinesTrailingSpaces(`<w:settings ${W}/>`)).toBe(false)
  })
})

describe('the XML helpers', () => {
  it('finds direct children only, nested or self-closing', () => {
    const found = children('<a><b><a/></b></a><c x="1"/>text<d>2</d>')
    expect(found.map((e) => e.name)).toEqual(['a', 'c', 'd'])
    expect(found[0].inner).toBe('<b><a/></b>')
    expect(attr(found[1].tag, 'x')).toBe('1')
  })

  it('decodes and encodes text', () => {
    expect(decodeText('R&amp;D &lt;1&gt; &#8211; &#x2014;')).toBe('R&D <1> – —')
    expect(encodeText('R&D <1>')).toBe('R&amp;D &lt;1&gt;')
  })
})
