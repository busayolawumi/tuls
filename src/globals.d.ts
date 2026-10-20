/** The FFmpeg engine's .wasm size in bytes, filled in at build time (vite.config.ts). */
declare const __FFMPEG_WASM_SIZE__: number

/** Where pdf.js's extra files are served, e.g. /pdfjs-6.4.299/ (plugins/pdfjs-assets.ts). */
declare const __PDFJS_ASSETS__: string

/** Where LibreOffice's files are served, and its download sizes (plugins/libreoffice.ts). */
declare const __LIBREOFFICE__: {
  /** The converter's worker, which loads the rest. */
  worker: string
  soffice: string
  sofficeWorker: string
  /** The two big files, gzipped, and their sizes in bytes. */
  wasm: string
  data: string
  wasmSize: number
  dataSize: number
  /** The browser cache the big files are kept in (Cache Storage). */
  cache: string
  /** Files for LibreOffice's fonts folder (extra fonts, fc_local.conf). */
  fonts: { url: string; name: string }[]
  /** Tuls's free fonts in one ZIP, also kept in the cache, and its size. */
  fontPack: string
  fontPackSize: number
}

/** Where the PDF to Word engine is served, and what to download (plugins/pymupdf.ts). */
declare const __PYMUPDF__: {
  /** Its folder, e.g. /engines/pymupdf-0.11.16/. */
  dir: string
  /** The browser cache it's kept in (Cache Storage). */
  cache: string
  /** The files Pyodide fetches, as served, and their sizes in bytes. */
  files: { url: string; size: number }[]
  /** Those served gzipped, by the name Pyodide asks for (without .gz). */
  gzipped: string[]
  /** The files a light start (PyMuPDF only, for Compress PDF) needs: URLs from `files`. */
  light: string[]
  /** The PyMuPDF wheel's name, which a light start loads. */
  wheel: string
}

/** The engine's font widths, for measuring text (plugins/libreoffice.ts). */
declare module 'virtual:tuls/font-metrics' {
  const metrics: {
    codePoints: number[]
    fonts: Record<
      string,
      Record<
        'regular' | 'bold' | 'italic' | 'boldItalic',
        { unitsPerEm: number; widths: number[] }
      >
    >
  }
  export default metrics
}
