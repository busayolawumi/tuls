import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pdfjsAssets } from './plugins/pdfjs-assets.ts'
import { toolPages } from './plugins/tool-pages.ts'

// The live site's headers (privacy policy, cross-origin isolation and so on)
// live in vercel.json. `vite preview` sends the same ones, so the browser
// tests check what visitors get.
const vercel = JSON.parse(
  readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'),
) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const siteHeaders = Object.fromEntries(
  vercel.headers
    .find((rule) => rule.source === '/(.*)')!
    .headers.map(({ key, value }) => [key, value]),
)

// The FFmpeg engine's real size, for the first-visit download percentage. The
// host compresses the file on the way, so the download itself doesn't say how
// big it is.
const ffmpegWasmSize = statSync(
  fileURLToPath(import.meta.resolve('@ffmpeg/core/wasm')),
).size

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), toolPages(), pdfjsAssets()],
  define: {
    __FFMPEG_WASM_SIZE__: JSON.stringify(ffmpegWasmSize),
  },
  // Pre-bundling breaks the worker that ffmpeg.wasm starts.
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  // ffmpeg.wasm starts its worker as a module and loads the core with import().
  worker: { format: 'es' },
  preview: { headers: siteHeaders },
})
