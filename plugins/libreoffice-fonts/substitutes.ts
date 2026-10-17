import { FREE_FONTS } from './free.ts'

// Fonts documents ask for that neither the LibreOffice engine nor Tuls
// (free.ts) has, and the engine font Tuls uses instead (plugins/libreoffice.ts
// turns these into fontconfig aliases in fc_local.conf).
//
// Each stand-in is the engine font of the same kind (sans, serif or mono)
// whose average width is closest, measured on 2026-10-16 against the real
// fonts (Office's and macOS's, measured locally and never shipped): letters weighted by how often they appear in English, plus
// spaces, digits and punctuation. `regular` and `bold` are how much wider
// (+) or narrower (−) the stand-in is. Lines wrap where they would in Office
// when the widths match, so width matters more than looks.
//
// After the stand-in, every alias lists Liberation Sans (Arial's twin) for
// characters the stand-in lacks, as Office falls back to Arial. Without it,
// LibreOffice takes them from DejaVu Sans: a bullet "●" in Open Sans came out
// nearly half as wide again as PowerPoint's (0.87 em against 0.60). Tuls's
// own fonts get the same fallback.

export type Substitute = {
  family: string
  use: string
  regular?: string
  bold?: string
  /** Also its weights named as fonts of their own (see WEIGHTS). */
  weights?: true
}

export const SUBSTITUTES: Substitute[] = [
  // Office's own. Calibri and Cambria are LibreOffice's aliases already; they
  // are here for the fallback (Caladea has no geometric bullets at all).
  { family: 'Calibri', use: 'Carlito' },
  { family: 'Cambria', use: 'Caladea' },
  // Aptos (Office's default since 2023): measured against Aptos Narrow.
  {
    family: 'Aptos',
    use: 'Carlito',
    regular: '−5.0%',
    bold: '−7.5%',
    weights: true,
  },
  { family: 'Aptos Narrow', use: 'Carlito', regular: '+3.0%', bold: '+1.7%' },
  { family: 'Aptos Display', use: 'Carlito' },
  { family: 'Calibri Light', use: 'Carlito', regular: '+1.1%' },
  { family: 'Candara', use: 'Carlito', regular: '−2.9%', bold: '−2.2%' },
  { family: 'Corbel', use: 'Carlito', regular: '−0.8%', bold: '−3.3%' },
  { family: 'Tw Cen MT', use: 'Carlito', regular: '+1.0%', bold: '−0.9%' },
  {
    family: 'Century Gothic',
    use: 'Noto Sans',
    regular: '−2.0%',
    bold: '+3.7%',
  },
  {
    family: 'Franklin Gothic Book',
    use: 'Linux Biolinum G',
    regular: '−3.9%',
    bold: '+2.3%',
  },
  {
    family: 'Gill Sans MT',
    use: 'Linux Biolinum G',
    regular: '+0.3%',
    bold: '−3.5%',
  },
  {
    family: 'Tahoma',
    use: 'DejaVu Sans Condensed',
    regular: '+2.6%',
    bold: '+1.1%',
  },
  { family: 'Verdana', use: 'DejaVu Sans', regular: '−0.4%', bold: '+0.3%' },
  {
    family: 'Trebuchet MS',
    use: 'Liberation Sans',
    regular: '−0.6%',
    bold: '+0.7%',
  },
  { family: 'Lucida Sans', use: 'Rubik', regular: '−4.9%', bold: '−2.0%' },
  {
    family: 'Helvetica',
    use: 'Liberation Sans',
    regular: '0.0%',
    bold: '0.0%',
  },
  {
    family: 'Helvetica Neue',
    use: 'Liberation Sans',
    regular: '−0.8%',
    bold: '0.0%',
  },
  {
    family: 'Garamond',
    use: 'Liberation Serif',
    regular: '+3.6%',
    bold: '+1.6%',
  },
  { family: 'Book Antiqua', use: 'Caladea', regular: '−3.0%', bold: '+1.3%' },
  {
    family: 'Palatino Linotype',
    use: 'Caladea',
    regular: '−3.0%',
    bold: '+1.3%',
  },
  {
    family: 'Bookman Old Style',
    use: 'Noto Serif',
    regular: '−3.6%',
    bold: '−4.6%',
  },
  { family: 'Constantia', use: 'Caladea', regular: '−0.5%', bold: '−1.2%' },
  {
    family: 'Century Schoolbook',
    use: 'DejaVu Serif Condensed',
    regular: '−0.8%',
    bold: '−1.7%',
  },
  {
    family: 'Georgia',
    use: 'DejaVu Serif Condensed',
    regular: '+4.2%',
    bold: '−1.1%',
  },
  {
    family: 'Rockwell',
    use: 'DejaVu Serif Condensed',
    regular: '+0.9%',
    bold: '+4.4%',
  },
  { family: 'Lucida Console', use: 'DejaVu Sans Mono', regular: '−0.1%' },
  // Nothing in the engine is within 9% of Consolas: the usual mono stand-in.
  {
    family: 'Consolas',
    use: 'Liberation Mono',
    regular: '+9.1%',
    bold: '+9.1%',
  },
  // Google Fonts: Tuls has most of them (free.ts). Not these.
  {
    family: 'Merriweather',
    use: 'Noto Serif',
    regular: '−1.1%',
    bold: '+1.7%',
    weights: true,
  },
  // Source Sans 3's earlier name.
  { family: 'Source Sans Pro', use: 'Source Sans 3', weights: true },
]

/** Characters a stand-in lacks come from here, as Office uses Arial. */
export const FALLBACK = 'Liberation Sans'

// Windows lists each extra weight of a font family as a font of its own
// ("Montserrat SemiBold"), and documents made there name it so. Tuls has
// regular and bold: lighter weights get the regular, heavier ones the bold.
// (Fontconfig compares names ignoring case, so this covers "Semibold".)
const WEIGHTS = {
  Thin: false,
  ExtraLight: false,
  Light: false,
  Medium: false,
  SemiBold: true,
  ExtraBold: true,
  Black: true,
}

/**
 * The fontconfig rules for the end of fc_local.conf: weights named as
 * fonts first, then the stand-ins, then Tuls's own fonts (`free`), which
 * only need the fallback.
 */
export function substituteAliases(
  substitutes = SUBSTITUTES,
  free = FREE_FONTS.map((font) => font.family),
) {
  const escape = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const family = (name: string) => `<family>${escape(name)}</family>`
  const named = new Set(
    [...substitutes.map((s) => s.family), ...free].map((name) =>
      name.toLowerCase(),
    ),
  )
  const lines = [
    '\t<!-- Added by Tuls: plugins/libreoffice-fonts/substitutes.ts -->',
  ]
  const weighted = [
    ...free,
    ...substitutes.filter((s) => s.weights).map((s) => s.family),
  ]
  for (const base of weighted) {
    for (const [weight, bold] of Object.entries(WEIGHTS)) {
      const name = `${base} ${weight}`
      if (named.has(name.toLowerCase())) continue
      lines.push(
        `\t<match target="pattern"><test name="family"><string>${escape(name)}</string></test><edit name="family" mode="assign" binding="same"><string>${escape(base)}</string></edit>${
          bold
            ? '<edit name="weight" mode="assign"><const>bold</const></edit>'
            : ''
        }</match>`,
      )
    }
  }
  for (const { family: name, use } of substitutes) {
    const accept = use === FALLBACK ? [use] : [use, FALLBACK]
    lines.push(
      `\t<alias binding="same">${family(name)}<accept>${accept.map(family).join('')}</accept></alias>`,
    )
  }
  for (const name of free) {
    lines.push(
      `\t<alias binding="same">${family(name)}<accept>${family(FALLBACK)}</accept></alias>`,
    )
  }
  return `${lines.join('\n')}\n`
}
