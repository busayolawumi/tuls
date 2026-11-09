import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { libreOffice } from './plugins/libreoffice.ts'
import { pdfjsAssets } from './plugins/pdfjs-assets.ts'
import { pymupdf } from './plugins/pymupdf.ts'
import { qpdf } from './plugins/qpdf.ts'
import { siteHeaders } from './plugins/site-headers.ts'
import { toolPages } from './plugins/tool-pages.ts'

// The FFmpeg engine's real size, for the first-visit download percentage. The
// host compresses the file on the way, so the download itself doesn't say how
// big it is.
const ffmpegWasmSize = statSync(
  fileURLToPath(import.meta.resolve('@ffmpeg/core/wasm')),
).size

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // First, so every response gets vercel.json's headers (site-headers.ts).
    siteHeaders(),
    react(),
    tailwindcss(),
    toolPages(),
    pdfjsAssets(),
    libreOffice(),
    pymupdf(),
    qpdf(),
  ],
  define: {
    __FFMPEG_WASM_SIZE__: JSON.stringify(ffmpegWasmSize),
  },
  // Pre-bundling breaks the worker that ffmpeg.wasm starts. The PDF to Word
  // engine is one plain module, only imported by its worker: found that late,
  // it would make the dev server reload the page.
  // qpdf and libheif, only imported by workers, are CommonJS: bundled up
  // front, so the dev server can serve them as modules without reloading the
  // page. jSquash finds its wasm next to its own files, so it stays as it is.
  optimizeDeps: {
    exclude: [
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util',
      '@bentopdf/pymupdf-wasm',
      '@jsquash/webp',
      '@jsquash/resize',
    ],
    include: ['@neslinesli93/qpdf-wasm', 'libheif-js/libheif-wasm/libheif.js'],
  },
  // ffmpeg.wasm starts its worker as a module and loads the core with import().
  // Workers are built on their own, with their own plugins.
  worker: { format: 'es', plugins: () => [qpdf()] },
})
