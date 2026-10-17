import { engineCache } from '../engineCache'
import { WordError } from './errors'

// The PDF to Word engine (about 40 MB) is saved on the device
// (engineCache.ts), and the worker's fetch wrapper (fetch.ts) reads it from
// there.

const engine = engineCache({
  cache: __PYMUPDF__.cache,
  files: __PYMUPDF__.files.map(({ url, size }) => ({
    url,
    size,
    type: 'application/octet-stream',
  })),
  oldCopies: /^tuls-pymupdf-/,
  error: (kind, cause) => new WordError(kind, cause),
})

/** The first-time download, in bytes. */
export const DOWNLOAD_SIZE = engine.size
export const isEngineSaved = engine.isSaved
export const saveEngine = engine.save
