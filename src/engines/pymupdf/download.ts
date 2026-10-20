import { engineCache } from '../engineCache'
import { WordError } from './errors'

// The PDF to Word engine (about 40 MB) is saved on the device
// (engineCache.ts), and the worker's fetch wrapper (fetch.ts) reads it from
// there. Compress PDF's light start needs only Python and PyMuPDF (about
// 23 MB): part of the same saved copy, so whichever tool comes first saves
// it for the other.

const files = __PYMUPDF__.files.map(({ url, size }) => ({
  url,
  size,
  type: 'application/octet-stream',
}))

const engine = engineCache({
  cache: __PYMUPDF__.cache,
  files,
  oldCopies: /^tuls-pymupdf-/,
  error: (kind, cause) => new WordError(kind, cause),
})

const light = engineCache({
  cache: __PYMUPDF__.cache,
  files: files.filter(({ url }) => __PYMUPDF__.light.includes(url)),
  oldCopies: /^tuls-pymupdf-/,
  error: (kind, cause) => new WordError(kind, cause),
  part: true,
})

/** The first-time download, in bytes. */
export const DOWNLOAD_SIZE = engine.size
export const isEngineSaved = engine.isSaved
export const saveEngine = engine.save

/** The light start's first-time download, in bytes. */
export const LIGHT_DOWNLOAD_SIZE = light.size
export const isLightEngineSaved = light.isSaved
export const saveLightEngine = light.save
