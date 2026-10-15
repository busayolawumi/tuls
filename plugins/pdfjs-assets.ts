import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

// pdf.js fetches extra files when a PDF needs them: fonts that aren't
// embedded, character maps for Chinese, Japanese and Korean text, image
// decoders and colour profiles. This serves them in development and copies
// them into the build, under a folder named after the pdf.js version, so
// they can be cached for good (vercel.json).

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('pdfjs-dist/package.json'))
const { version } = require('pdfjs-dist/package.json') as { version: string }
const FOLDERS = ['standard_fonts', 'cmaps', 'wasm', 'iccs']

/** Where the files are served from, e.g. /pdfjs-6.4.299/. */
export const PDFJS_ASSETS = `/pdfjs-${version}/`

export function pdfjsAssets(): Plugin {
  return {
    name: 'tuls:pdfjs-assets',
    config: () => ({
      define: { __PDFJS_ASSETS__: JSON.stringify(PDFJS_ASSETS) },
    }),
    configureServer(server) {
      server.middlewares.use(PDFJS_ASSETS, async (req, res, next) => {
        const [folder, file, ...rest] = (req.url ?? '').slice(1).split('/')
        if (!FOLDERS.includes(folder) || !file || rest.length) return next()
        try {
          res.end(await readFile(join(root, folder, file)))
        } catch {
          next()
        }
      })
    },
    async generateBundle() {
      for (const folder of FOLDERS) {
        for (const file of await readdir(join(root, folder))) {
          this.emitFile({
            type: 'asset',
            fileName: `${PDFJS_ASSETS.slice(1)}${folder}/${file}`,
            source: await readFile(join(root, folder, file)),
          })
        }
      }
    },
  }
}
