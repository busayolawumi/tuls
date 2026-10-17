import { attr, child, children, decodeText, encodeText, isOn } from './xml'

// Word's "underline trailing spaces" setting (<w:ulTrailSpace/>): with it,
// Word underlines the spaces and tabs at the end of a paragraph, as far as
// the right margin. CVs use it for headings with a rule to the margin: the
// word, a tab and a long run of underlined spaces. LibreOffice ignores the
// setting and never underlines trailing spaces, so the rules disappear.
//
// This works out where Word's underline ends, from the engine's own font
// widths (virtual:tuls/font-metrics), and puts a tab to a tab stop there
// instead of the spaces, as LibreOffice does underline tabs. Checked
// against Word for Mac: within 0.2 pt.
//
// Only paragraphs that can be measured surely are changed: plain runs of
// text and tabs, on one line, in fonts whose widths are known. The rest are
// left as they are.

/** Character widths of the engine's fonts (plugins/libreoffice.ts). */
export type FontMetrics = {
  codePoints: number[]
  fonts: Record<string, Record<Style, { unitsPerEm: number; widths: number[] }>>
}
type Style = 'regular' | 'bold' | 'italic' | 'boldItalic'

// Office fonts and the engine's stand-ins with the same widths (fc_local.conf
// and LibreOffice's own replacement table).
const STAND_INS: Record<string, string> = {
  'times new roman': 'Liberation Serif',
  'liberation serif': 'Liberation Serif',
  arial: 'Liberation Sans',
  'liberation sans': 'Liberation Sans',
  'courier new': 'Liberation Mono',
  'liberation mono': 'Liberation Mono',
  'arial narrow': 'Liberation Sans Narrow',
  'liberation sans narrow': 'Liberation Sans Narrow',
  calibri: 'Carlito',
  carlito: 'Carlito',
  cambria: 'Caladea',
  caladea: 'Caladea',
}

/** Run properties that change how wide text is, or whether it's underlined. */
type RunProps = {
  font?: string
  /** Theme font, "minor" or "major", used when `font` isn't set. */
  theme?: 'minor' | 'major'
  /** In half-points. */
  size?: number
  bold?: boolean
  italic?: boolean
  caps?: boolean
  smallCaps?: boolean
  hidden?: boolean
  /** Extra space after each character, in twips. */
  spacing?: number
  underline?: boolean
}

type TabStop = { pos: number; clear: boolean }

type ParagraphProps = {
  tabs: TabStop[]
  left?: number
  right?: number
  firstLine?: number
  hanging?: number
  jc?: string
  numbered?: boolean
  bidi?: boolean
}

type StyleDef = {
  basedOn?: string
  run: RunProps
  paragraph: ParagraphProps
}

function runProps(rPr: string | undefined): RunProps {
  const props: RunProps = {}
  if (!rPr) return props
  for (const element of children(rPr)) {
    const { name, tag } = element
    if (name === 'w:rFonts') {
      const font = attr(tag, 'w:ascii') ?? attr(tag, 'w:hAnsi')
      const theme = attr(tag, 'w:asciiTheme') ?? attr(tag, 'w:hAnsiTheme')
      if (font) {
        props.font = font
        props.theme = undefined
      } else if (theme) {
        props.theme = theme.startsWith('major') ? 'major' : 'minor'
      }
    } else if (name === 'w:sz') props.size = Number(attr(tag, 'w:val'))
    else if (name === 'w:b') props.bold = isOn(tag)
    else if (name === 'w:i') props.italic = isOn(tag)
    else if (name === 'w:caps') props.caps = isOn(tag)
    else if (name === 'w:smallCaps') props.smallCaps = isOn(tag)
    else if (name === 'w:vanish') props.hidden = isOn(tag)
    else if (name === 'w:spacing') props.spacing = Number(attr(tag, 'w:val'))
    else if (name === 'w:u') props.underline = isOn(tag)
  }
  return props
}

function paragraphProps(pPr: string | undefined): ParagraphProps {
  const props: ParagraphProps = { tabs: [] }
  if (!pPr) return props
  for (const { name, tag, inner } of children(pPr)) {
    if (name === 'w:tabs') {
      for (const tab of children(inner)) {
        props.tabs.push({
          pos: Number(attr(tab.tag, 'w:pos')),
          clear: attr(tab.tag, 'w:val') === 'clear',
        })
      }
    } else if (name === 'w:ind') {
      const value = (key: string) => {
        const v = attr(tag, key)
        return v === undefined ? undefined : Number(v)
      }
      props.left = value('w:left') ?? value('w:start')
      props.right = value('w:right') ?? value('w:end')
      props.firstLine = value('w:firstLine')
      props.hanging = value('w:hanging')
    } else if (name === 'w:jc') props.jc = attr(tag, 'w:val')
    else if (name === 'w:numPr') {
      const numId = child(inner, 'w:numId')
      props.numbered = !numId || attr(numId.tag, 'w:val') !== '0'
    } else if (name === 'w:bidi') props.bidi = isOn(tag)
  }
  return props
}

/** Later properties win; undefined ones don't count. */
function merge<T extends object>(...layers: T[]): T {
  const out = {} as T
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

/** Tab stops after applying `next` (with its clears) on top of `base`. */
function mergeTabs(base: TabStop[], next: TabStop[]) {
  let tabs = [...base]
  for (const tab of next) {
    tabs = tabs.filter((t) => t.pos !== tab.pos)
    if (!tab.clear) tabs.push(tab)
  }
  return tabs.sort((a, b) => a.pos - b.pos)
}

/** The document's styles, defaults and theme fonts. */
export type Styles = {
  styles: Map<string, StyleDef>
  defaultRun: RunProps
  defaultParagraph: ParagraphProps
  defaultParagraphStyle?: string
  themeFonts: { minor?: string; major?: string }
}

export function readStyles(stylesXml: string, themeXml = ''): Styles {
  const styles = new Map<string, StyleDef>()
  let defaultParagraphStyle: string | undefined
  const root = child(stylesXml, 'w:styles')?.inner ?? ''
  let defaultRun: RunProps = {}
  let defaultParagraph: ParagraphProps = { tabs: [] }
  for (const element of children(root)) {
    if (element.name === 'w:docDefaults') {
      const rPr = child(
        child(element.inner, 'w:rPrDefault')?.inner ?? '',
        'w:rPr',
      )
      const pPr = child(
        child(element.inner, 'w:pPrDefault')?.inner ?? '',
        'w:pPr',
      )
      defaultRun = runProps(rPr?.inner)
      defaultParagraph = paragraphProps(pPr?.inner)
    } else if (element.name === 'w:style') {
      const id = attr(element.tag, 'w:styleId')
      if (!id) continue
      const isDefault = ['1', 'true', 'on'].includes(
        attr(element.tag, 'w:default') ?? '',
      )
      if (attr(element.tag, 'w:type') === 'paragraph' && isDefault) {
        defaultParagraphStyle = id
      }
      const basedOn = child(element.inner, 'w:basedOn')
      styles.set(id, {
        basedOn: basedOn ? attr(basedOn.tag, 'w:val') : undefined,
        run: runProps(child(element.inner, 'w:rPr')?.inner),
        paragraph: paragraphProps(child(element.inner, 'w:pPr')?.inner),
      })
    }
  }
  const themeFont = (kind: string) =>
    new RegExp(`<a:${kind}Font>\\s*<a:latin typeface="([^"]*)"`).exec(
      themeXml,
    )?.[1] || undefined
  return {
    styles,
    defaultRun,
    defaultParagraph,
    defaultParagraphStyle,
    themeFonts: { minor: themeFont('minor'), major: themeFont('major') },
  }
}

/** A style and the ones it's based on, the most basic first. */
function chain(styles: Styles, id: string | undefined) {
  const found: StyleDef[] = []
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const style = styles.styles.get(id)
    if (!style) break
    found.unshift(style)
    id = style.basedOn
  }
  return found
}

/** Where a font's widths are, if they're known. */
function widthsOf(metrics: FontMetrics, props: RunProps, styles: Styles) {
  const name = props.font ?? (props.theme && styles.themeFonts[props.theme])
  const family = name && STAND_INS[name.toLowerCase()]
  const font = family ? metrics.fonts[family] : undefined
  if (!font) return undefined
  const style: Style =
    props.bold && props.italic
      ? 'boldItalic'
      : props.bold
        ? 'bold'
        : props.italic
          ? 'italic'
          : 'regular'
  return font[style]
}

/** A character's width in twips, or undefined if it can't be measured. */
function charWidth(
  char: string,
  props: RunProps,
  metrics: FontMetrics,
  styles: Styles,
) {
  const font = widthsOf(metrics, props, styles)
  if (!font || props.smallCaps || props.hidden) return undefined
  const shown = props.caps ? char.toUpperCase() : char
  const index = metrics.codePoints.indexOf(shown.codePointAt(0)!)
  const advance = index < 0 ? 0 : font.widths[index]
  if (!advance) return undefined
  // Size is in half-points; twips are twentieths of a point.
  return (
    (advance / font.unitsPerEm) * (props.size ?? 20) * 10 + (props.spacing ?? 0)
  )
}

/** The next tab stop after `x`: a custom one, or Word's default spacing. */
function nextStop(x: number, tabs: TabStop[], defaultTab: number) {
  const custom = tabs.find((tab) => tab.pos > x + 1)
  if (custom) return custom.pos
  return (Math.floor(x / defaultTab) + 1) * defaultTab
}

// Blank characters: spaces and no-break spaces.
const BLANKS = new Set([' ', '\u00a0'])

// Run contents Tuls can measure. Anything else (pictures, fields, breaks,
// symbols, footnote marks…) leaves the paragraph as it is.
const MEASURABLE = new Set(['w:rPr', 'w:t', 'w:tab', 'w:lastRenderedPageBreak'])
// Paragraph contents that don't affect the text. Anything else (links,
// fields, tracked changes, content controls…) leaves the paragraph alone.
const NEUTRAL = new Set([
  'w:pPr',
  'w:r',
  'w:bookmarkStart',
  'w:bookmarkEnd',
  'w:proofErr',
  'w:permStart',
  'w:permEnd',
  'w:commentRangeStart',
  'w:commentRangeEnd',
])

type Item = {
  /** Which run it's in, by position among the paragraph's runs. */
  run: number
  kind: 'char' | 'tab'
  char: string
  props: RunProps
}

/** Section text widths (twips), from each section break's page settings. */
function textWidth(sectPr: string) {
  const size = child(sectPr, 'w:pgSz')
  const margins = child(sectPr, 'w:pgMar')
  const cols = child(sectPr, 'w:cols')
  if (!size || !margins) return undefined
  if (cols && Number(attr(cols.tag, 'w:num') ?? 1) > 1) return undefined
  const n = (tag: string, name: string) => Number(attr(tag, name) ?? 0)
  return (
    n(size.tag, 'w:w') -
    n(margins.tag, 'w:left') -
    n(margins.tag, 'w:right') -
    n(margins.tag, 'w:gutter')
  )
}

type Context = {
  styles: Styles
  metrics: FontMetrics
  defaultTab: number
}

/** The paragraph rewritten, or undefined to leave it as it is. */
function fixParagraph(
  paragraph: { tag: string; inner: string },
  width: number,
  { styles, metrics, defaultTab }: Context,
) {
  const parts = children(paragraph.inner)
  if (parts.some((part) => !NEUTRAL.has(part.name))) return undefined
  const pPr = parts.find((part) => part.name === 'w:pPr')
  const direct = paragraphProps(pPr?.inner)
  const pStyle = pPr && child(pPr.inner, 'w:pStyle')
  const styleId = pStyle
    ? attr(pStyle.tag, 'w:val')
    : styles.defaultParagraphStyle
  const styleChain = chain(styles, styleId)
  const props = merge(
    styles.defaultParagraph,
    ...styleChain.map((s) => s.paragraph),
    direct,
  )
  let inherited = mergeTabs([], styles.defaultParagraph.tabs)
  for (const s of styleChain) inherited = mergeTabs(inherited, s.paragraph.tabs)
  const tabs = mergeTabs(inherited, direct.tabs)
  if (props.numbered || props.bidi) return undefined
  if (props.jc && !['left', 'start', 'both', 'distribute'].includes(props.jc)) {
    return undefined
  }

  const paragraphRun = merge(styles.defaultRun, ...styleChain.map((s) => s.run))
  const runs = parts.filter((part) => part.name === 'w:r')
  const items: Item[] = []
  for (const [index, run] of runs.entries()) {
    const contents = children(run.inner)
    if (contents.some((c) => !MEASURABLE.has(c.name))) return undefined
    const rPr = contents.find((c) => c.name === 'w:rPr')
    const rStyle = rPr && child(rPr.inner, 'w:rStyle')
    const runChain = rStyle ? chain(styles, attr(rStyle.tag, 'w:val')) : []
    const runProps_ = merge(
      paragraphRun,
      ...runChain.map((s) => s.run),
      runProps(rPr?.inner),
    )
    for (const c of contents) {
      if (c.name === 'w:tab') {
        items.push({ run: index, kind: 'tab', char: '\t', props: runProps_ })
      } else if (c.name === 'w:t') {
        for (const char of decodeText(c.inner)) {
          items.push({ run: index, kind: 'char', char, props: runProps_ })
        }
      }
    }
  }

  // Everything after the last visible character: spaces, no-break spaces
  // and tabs, which must all be underlined. Word underlines all of it, so
  // it all becomes one tab, and one even line.
  let first = items.length
  while (
    first > 0 &&
    (items[first - 1].kind === 'tab' || BLANKS.has(items[first - 1].char))
  ) {
    first--
  }
  if (first === items.length) return undefined
  if (items.slice(first).some((item) => !item.props.underline)) return undefined

  // Measure the line in twips, from the margin.
  const right = width - (props.right ?? 0)
  let x = (props.left ?? 0) + (props.firstLine ?? 0) - (props.hanging ?? 0)
  let textEnd = x
  // Default tab stops the text's own tabs land on. A custom stop turns off
  // the default ones to its left (in Word and LibreOffice), so adding one
  // would move these tabs: they're kept as custom stops of their own.
  const pinned = new Set<number>()
  for (const [i, item] of items.entries()) {
    if (i === first) textEnd = x
    if (item.kind === 'tab') {
      const next = nextStop(x, tabs, defaultTab)
      if (i < first && !tabs.some((tab) => tab.pos === next)) pinned.add(next)
      x = next
    } else {
      const w = charWidth(item.char, item.props, metrics, styles)
      if (w === undefined) return undefined
      x += w
    }
    // The text itself must fit on the line, or it would wrap. So must a
    // no-break space: Word moves one past the margin onto a new line,
    // where ordinary trailing spaces just hang off the end.
    if (i < first && x > right) return undefined
    if (item.char === '\u00a0' && x > right) return undefined
  }
  const end = Math.min(x, right)
  if (end - textEnd < 10) return undefined

  // A tab to a stop where Word's underline ends: right-aligned at the edge,
  // or left-aligned short of it. Stops in between are cleared, so the tab
  // goes straight there.
  const stop =
    end >= right - 1
      ? { val: 'right', pos: Math.round(right) }
      : { val: 'left', pos: Math.round(end) }
  const keptDirect = direct.tabs.filter(
    (tab) => tab.clear || tab.pos <= textEnd + 1 || tab.pos > stop.pos,
  )
  const directXml = pPr ? (child(pPr.inner, 'w:tabs')?.inner ?? '') : ''
  const entries = [
    ...children(directXml)
      .filter((tab) =>
        keptDirect.some((k) => k.pos === Number(attr(tab.tag, 'w:pos'))),
      )
      .map((tab) => ({
        pos: Number(attr(tab.tag, 'w:pos')),
        xml: directXml.slice(tab.start, tab.end),
      })),
    ...inherited
      .filter((tab) => tab.pos > textEnd + 1 && tab.pos <= stop.pos)
      .map((tab) => ({
        pos: tab.pos,
        xml: `<w:tab w:val="clear" w:pos="${tab.pos}"/>`,
      })),
    ...[...pinned].map((pos) => ({
      pos,
      xml: `<w:tab w:val="left" w:pos="${pos}"/>`,
    })),
    { pos: stop.pos, xml: `<w:tab w:val="${stop.val}" w:pos="${stop.pos}"/>` },
  ].sort((a, b) => a.pos - b.pos)
  const tabsXml = `<w:tabs>${entries.map((entry) => entry.xml).join('')}</w:tabs>`

  // The runs: everything up to the trailing spaces, then the tab, in the
  // run where the spaces start.
  const firstRun = items[first].run
  const keepInFirstRun = items
    .slice(0, first)
    .filter((item) => item.run === firstRun)
  const newRuns = runs.map((run, index) => {
    if (index < firstRun) return paragraph.inner.slice(run.start, run.end)
    if (index > firstRun) return ''
    const rPr = children(run.inner).find((c) => c.name === 'w:rPr')
    let content = ''
    let text = ''
    const flush = () => {
      if (text) content += `<w:t xml:space="preserve">${encodeText(text)}</w:t>`
      text = ''
    }
    for (const item of keepInFirstRun) {
      if (item.kind === 'tab') {
        flush()
        content += '<w:tab/>'
      } else text += item.char
    }
    flush()
    const rPrXml = rPr ? run.inner.slice(rPr.start, rPr.end) : ''
    return `${run.tag}${rPrXml}${content}<w:tab/></w:r>`
  })

  // Put it back together: the paragraph properties with the new tabs, then
  // the other contents in their places.
  let pPrXml: string
  if (pPr) {
    const existing = child(pPr.inner, 'w:tabs')
    if (existing) {
      pPrXml = `${pPr.tag}${pPr.inner.slice(0, existing.start)}${tabsXml}${pPr.inner.slice(existing.end)}</w:pPr>`
    } else {
      // w:tabs comes before these in a paragraph's properties.
      const later = children(pPr.inner).find((c) => AFTER_TABS.has(c.name))
      const at = later ? later.start : pPr.inner.length
      pPrXml = `${pPr.tag}${pPr.inner.slice(0, at)}${tabsXml}${pPr.inner.slice(at)}</w:pPr>`
    }
  } else {
    pPrXml = `<w:pPr>${tabsXml}</w:pPr>`
  }
  let runIndex = 0
  const rebuilt = parts.map((part) => {
    if (part.name === 'w:pPr') return pPrXml
    if (part.name === 'w:r') return newRuns[runIndex++]
    return paragraph.inner.slice(part.start, part.end)
  })
  return `${paragraph.tag}${pPr ? '' : pPrXml}${rebuilt.join('')}</w:p>`
}

// What follows w:tabs in a paragraph's properties (ECMA-376 CT_PPrBase).
const AFTER_TABS = new Set([
  'w:suppressAutoHyphens',
  'w:kinsoku',
  'w:wordWrap',
  'w:overflowPunct',
  'w:topLinePunct',
  'w:autoSpaceDE',
  'w:autoSpaceDN',
  'w:bidi',
  'w:adjustRightInd',
  'w:snapToGrid',
  'w:spacing',
  'w:ind',
  'w:contextualSpacing',
  'w:mirrorIndents',
  'w:suppressOverlap',
  'w:jc',
  'w:textDirection',
  'w:textAlignment',
  'w:textboxTightWrap',
  'w:outlineLvl',
  'w:divId',
  'w:cnfStyle',
  'w:rPr',
  'w:sectPr',
  'w:pPrChange',
])

/** Whether the document asks for trailing spaces to be underlined. */
export function underlinesTrailingSpaces(settingsXml: string) {
  const compat = child(
    child(settingsXml, 'w:settings')?.inner ?? '',
    'w:compat',
  )
  const setting = compat && child(compat.inner, 'w:ulTrailSpace')
  return setting ? isOn(setting.tag) : false
}

/**
 * The document body with Word's underlined trailing spaces turned into
 * tabs LibreOffice will underline the same way. Returns it unchanged if
 * there's nothing to do.
 */
export function underlineTrailingSpaces(
  documentXml: string,
  {
    stylesXml,
    themeXml,
    settingsXml,
    metrics,
  }: {
    stylesXml: string
    themeXml?: string
    settingsXml: string
    metrics: FontMetrics
  },
) {
  const document = child(documentXml, 'w:document')
  const body = document && child(document.inner, 'w:body')
  if (!document || !body) return documentXml
  const defaultTabTag = child(
    child(settingsXml, 'w:settings')?.inner ?? '',
    'w:defaultTabStop',
  )
  const context: Context = {
    styles: readStyles(stylesXml, themeXml),
    metrics,
    defaultTab: Number(
      (defaultTabTag && attr(defaultTabTag.tag, 'w:val')) ?? 720,
    ),
  }

  // Each paragraph belongs to the section of the next section break: one
  // in a paragraph's properties, or the body's own at the end.
  const blocks = children(body.inner)
  const widths: (number | undefined)[] = []
  let pending: number[] = []
  for (const [index, block] of blocks.entries()) {
    if (block.name === 'w:p') {
      pending.push(index)
      const pPr = child(block.inner, 'w:pPr')
      const sectPr = pPr && child(pPr.inner, 'w:sectPr')
      if (sectPr) {
        for (const i of pending) widths[i] = textWidth(sectPr.inner)
        pending = []
      }
    } else if (block.name === 'w:sectPr') {
      for (const i of pending) widths[i] = textWidth(block.inner)
      pending = []
    }
  }

  let changed = false
  const out = blocks.map((block, index) => {
    const original = body.inner.slice(block.start, block.end)
    const width = widths[index]
    if (block.name !== 'w:p' || width === undefined) return original
    const fixed = fixParagraph(block, width, context)
    if (fixed === undefined) return original
    changed = true
    return fixed
  })
  if (!changed) return documentXml

  // Keep whatever sits between the blocks (whitespace) as it was.
  let rebuilt = ''
  let at = 0
  for (const [index, block] of blocks.entries()) {
    rebuilt += body.inner.slice(at, block.start) + out[index]
    at = block.end
  }
  rebuilt += body.inner.slice(at)
  const bodyStart = document.start + document.tag.length + body.start
  const innerStart = bodyStart + body.tag.length
  return (
    documentXml.slice(0, innerStart) +
    rebuilt +
    documentXml.slice(innerStart + body.inner.length)
  )
}
