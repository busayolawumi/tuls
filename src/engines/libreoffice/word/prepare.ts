import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  underlineTrailingSpaces,
  underlinesTrailingSpaces,
  type FontMetrics,
} from './trailingSpaces'

// Changes to a .docx before LibreOffice opens it, for Word behaviour
// LibreOffice doesn't have (see trailingSpaces.ts). Most documents need
// none, and come back as they were, without being unpacked.

const loadMetrics = async () =>
  (await import('virtual:tuls/font-metrics')).default as FontMetrics

/** Reads one part of the package, if it's there. */
function part(zip: Uint8Array, name: string) {
  const found = unzipSync(zip, { filter: (file) => file.name === name })[name]
  return found ? strFromU8(found) : undefined
}

/**
 * The .docx with Tuls's changes, or undefined if it needs none.
 * `metrics` is only loaded when a document needs measuring.
 */
export async function prepareDocx(
  zip: Uint8Array,
  metrics: () => Promise<FontMetrics> = loadMetrics,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const settingsXml = part(zip, 'word/settings.xml')
  if (!settingsXml || !underlinesTrailingSpaces(settingsXml)) return undefined

  const files = unzipSync(zip)
  const documentXml = files['word/document.xml']
  const stylesXml = files['word/styles.xml']
  if (!documentXml || !stylesXml) return undefined
  const before = strFromU8(documentXml)
  const after = underlineTrailingSpaces(before, {
    stylesXml: strFromU8(stylesXml),
    themeXml: files['word/theme/theme1.xml']
      ? strFromU8(files['word/theme/theme1.xml'])
      : undefined,
    settingsXml,
    metrics: await metrics(),
  })
  if (after === before) return undefined

  files['word/document.xml'] = strToU8(after)
  // Text parts are compressed; pictures and the like already are, so
  // they're stored as they are.
  const repacked: Zippable = {}
  for (const [name, data] of Object.entries(files)) {
    repacked[name] = [data, { level: /\.(xml|rels)$/i.test(name) ? 6 : 0 }]
  }
  return zipSync(repacked) as Uint8Array<ArrayBuffer>
}
