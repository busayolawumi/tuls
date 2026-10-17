import { engineCache } from '../engineCache'
import { OfficeError } from './errors'

// LibreOffice's two big files (77 MB gzipped) and Tuls's free fonts (5 MB)
// are saved on the device (engineCache.ts). The engine's own fetch wrapper
// (plugins/libreoffice-prelude.js) reads the big files from there, and the
// converter the fonts.

const engine = engineCache({
  cache: __LIBREOFFICE__.cache,
  files: [
    {
      url: __LIBREOFFICE__.wasm,
      size: __LIBREOFFICE__.wasmSize,
      type: 'application/gzip',
    },
    {
      url: __LIBREOFFICE__.data,
      size: __LIBREOFFICE__.dataSize,
      type: 'application/gzip',
    },
    {
      url: __LIBREOFFICE__.fontPack,
      size: __LIBREOFFICE__.fontPackSize,
      type: 'application/zip',
    },
  ],
  oldCopies: /^tuls-libreoffice-/,
  error: (kind, cause) => new OfficeError(kind, cause),
})

/** The first-time download, in bytes. */
export const DOWNLOAD_SIZE = engine.size
export const isEngineSaved = engine.isSaved
export const engineFile = engine.file
export const saveEngine = engine.save
