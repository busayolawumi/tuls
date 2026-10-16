import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { libreOffice } from './plugins/libreoffice.ts'
import { pdfjsAssets } from './plugins/pdfjs-assets.ts'
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
  ],
  define: {
    __FFMPEG_WASM_SIZE__: JSON.stringify(ffmpegWasmSize),
  },
  // Pre-bundling breaks the worker that ffmpeg.wasm starts.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  // ffmpeg.wasm starts its worker as a module and loads the core with import().
  worker: { format: 'es' },
})
