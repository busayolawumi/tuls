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
  /** Extra fonts for LibreOffice: where they are, and their file names. */
  fonts: { url: string; name: string }[]
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
