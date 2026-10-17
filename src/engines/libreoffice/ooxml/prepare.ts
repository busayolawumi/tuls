import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { capitalizeCategories, hasGradientLines, solidLines } from './charts'
import { colourMap, themeColours, USUAL_MAP } from './colours'
import {
  underlineTrailingSpaces,
  underlinesTrailingSpaces,
  type FontMetrics,
} from './trailingSpaces'

// Changes to a Word, Excel or PowerPoint file (Office Open XML) before
// LibreOffice opens it, for Office behaviour LibreOffice doesn't have:
//
// - Word's "underline trailing spaces" setting (trailingSpaces.ts)
// - chart labels in capitals, and chart lines drawn with a gradient
//   (charts.ts)
//
// Only the small parts that might need a change are unpacked to check. Most
// files need none and come back as they were.

const loadMetrics = async () =>
  (await import('virtual:tuls/font-metrics')).default as FontMetrics

const CHART = /^(word|xl|ppt)\/charts\/chart\d+\.xml$/
const SETTINGS = 'word/settings.xml'
const THEME = /^(word|xl|ppt)\/theme\/theme\d+\.xml$/
// The links PowerPoint's parts make to each other (slide → layout →
// master → theme), and the masters, for their colour mapping.
const PPT_LINKS =
  /^ppt\/(slides|slideLayouts|slideMasters)\/_rels\/[^/]+\.xml\.rels$/
const MASTER = /^ppt\/slideMasters\/[^/]+\.xml$/

/** The named parts of the package, unpacked; others aren't. */
function parts(zip: Uint8Array, wanted: (name: string) => boolean) {
  const found = unzipSync(zip, { filter: (file) => wanted(file.name) })
  return Object.fromEntries(
    Object.entries(found).map(([name, data]) => [name, strFromU8(data)]),
  )
}

/** A part's links (its .rels part), as type → the parts they point to. */
function links(part: string, all: Record<string, string>) {
  const folder = part.slice(0, part.lastIndexOf('/') + 1)
  const rels = all[`${folder}_rels/${part.slice(folder.length)}.rels`] ?? ''
  const found: { type: string; target: string }[] = []
  for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    const type = /\bType="([^"]*)"/.exec(tag)?.[1] ?? ''
    const target = /\bTarget="([^"]*)"/.exec(tag)?.[1]
    if (!target || /\bTargetMode="External"/.test(tag)) continue
    found.push({
      type: type.split('/').pop()!,
      target: resolve(folder, target),
    })
  }
  return found
}

/** A link's target as a part name, e.g. ../charts/chart1.xml from ppt/slides/. */
function resolve(folder: string, target: string) {
  const path = target.startsWith('/') ? [] : folder.split('/').slice(0, -1)
  for (const piece of target.replace(/^\//, '').split('/')) {
    if (piece === '..') path.pop()
    else if (piece !== '.') path.push(piece)
  }
  return path.join('/')
}

/**
 * The theme a chart's colours come from, and the colour mapping. In Word
 * and Excel files there's one theme. In PowerPoint, it's the theme of the
 * slide master behind the slide the chart is on.
 */
function chartTheme(chart: string, all: Record<string, string>) {
  if (!chart.startsWith('ppt/')) {
    const themes = Object.keys(all).filter(
      (name) => THEME.test(name) && name.startsWith(chart.split('/')[0]),
    )
    return themes.length === 1
      ? { theme: themeColours(all[themes[0]]), map: USUAL_MAP }
      : undefined
  }
  const slide = Object.keys(all)
    .filter((name) => /^ppt\/slides\/_rels\//.test(name))
    .map((rels) => rels.replace('_rels/', '').replace(/\.rels$/, ''))
    .find((name) => links(name, all).some((link) => link.target === chart))
  const step = (part: string | undefined, type: string) =>
    part && links(part, all).find((link) => link.type === type)?.target
  const master = step(step(slide, 'slideLayout'), 'slideMaster')
  const theme = step(master, 'theme')
  if (!master || !theme || !all[theme]) return undefined
  return { theme: themeColours(all[theme]), map: colourMap(all[master]) }
}

/**
 * The file with Tuls's changes, or undefined if it needs none. `metrics`
 * is only loaded when a Word document needs measuring.
 */
export async function prepareOffice(
  zip: Uint8Array,
  metrics: () => Promise<FontMetrics> = loadMetrics,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const changed: Record<string, string> = {}
  const small = parts(zip, (name) => name === SETTINGS || CHART.test(name))
  const charts = Object.keys(small).filter((name) => CHART.test(name))

  for (const name of charts) {
    const fixed = capitalizeCategories(small[name])
    if (fixed !== small[name]) changed[name] = fixed
  }

  const gradients = charts.filter((name) =>
    hasGradientLines(changed[name] ?? small[name]),
  )
  if (gradients.length > 0) {
    const themes = parts(
      zip,
      (name) => THEME.test(name) || PPT_LINKS.test(name) || MASTER.test(name),
    )
    for (const name of gradients) {
      const colours = chartTheme(name, themes)
      if (!colours) continue
      const xml = changed[name] ?? small[name]
      const fixed = solidLines(xml, colours.theme, colours.map)
      if (fixed !== xml) changed[name] = fixed
    }
  }

  const settingsXml = small[SETTINGS]
  if (settingsXml && underlinesTrailingSpaces(settingsXml)) {
    const word = parts(zip, (name) =>
      [
        'word/document.xml',
        'word/styles.xml',
        'word/theme/theme1.xml',
      ].includes(name),
    )
    const documentXml = word['word/document.xml']
    if (documentXml && word['word/styles.xml']) {
      const fixed = underlineTrailingSpaces(documentXml, {
        stylesXml: word['word/styles.xml'],
        themeXml: word['word/theme/theme1.xml'],
        settingsXml,
        metrics: await metrics(),
      })
      if (fixed !== documentXml) changed['word/document.xml'] = fixed
    }
  }

  if (Object.keys(changed).length === 0) return undefined
  const files = unzipSync(zip)
  for (const [name, xml] of Object.entries(changed)) files[name] = strToU8(xml)
  // Text parts are compressed; pictures and the like already are, so
  // they're stored as they are.
  const repacked: Zippable = {}
  for (const [name, data] of Object.entries(files)) {
    repacked[name] = [data, { level: /\.(xml|rels)$/i.test(name) ? 6 : 0 }]
  }
  return zipSync(repacked) as Uint8Array<ArrayBuffer>
}
