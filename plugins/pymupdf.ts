import { createReadStream, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { gzipOnce } from './gzip-once.ts'

// PyMuPDF with pdf2docx, compiled to WebAssembly and run by Pyodide (Python
// in the browser), for PDF to Word: @bentopdf/pymupdf-wasm. Its JavaScript is
// bundled into Tuls's worker (src/engines/pymupdf/worker.ts); its runtime
// and Python packages are served as they are, from
// /engines/pymupdf-<version>/, which vercel.json caches for good. This plugin
//
// - gzips the two files that compress well, once, into node_modules/.cache
//   (NumPy's package 12 → 3 MB, Pyodide's WebAssembly 9 → 3 MB). The rest are
//   compressed already: Python packages are ZIPs.
// - serves them in development, and copies them into the build.
//
// Pyodide loads its two scripts with import(), through the browser's own
// cache. Everything else it fetches, and the worker's fetch wrapper reads
// those from the copy the page saved (src/engines/engineCache.ts).

// The package only lets its script be resolved: its folder is the one above.
const root = dirname(
  dirname(fileURLToPath(import.meta.resolve('@bentopdf/pymupdf-wasm'))),
)
const { version } = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
) as { version: string }

export const PYMUPDF_DIR = `/engines/pymupdf-${version}/`
/** The browser cache the page keeps the engine in, one per version. */
export const PYMUPDF_CACHE = `tuls-pymupdf-${version}`
const GZIP_CACHE = fileURLToPath(
  new URL(`../node_modules/.cache/${PYMUPDF_CACHE}/`, import.meta.url),
)
const SCRIPTS = ['pyodide.js', 'pyodide.asm.js']
const compresses = (name: string) =>
  name === 'pyodide.asm.wasm' || /^numpy-.*\.whl$/.test(name)

export type PyMuPdfInfo = {
  /** Where the engine is served, e.g. /engines/pymupdf-0.11.16/. */
  dir: string
  /** The browser cache it's kept in. */
  cache: string
  /** The files Pyodide fetches, as served, and their sizes, for progress. */
  files: { url: string; size: number }[]
  /** Those served gzipped, by the name Pyodide asks for (without .gz). */
  gzipped: string[]
}

type Engine = {
  /** Every served file, by its name in PYMUPDF_DIR, and where it is on disk. */
  served: Map<string, string>
  info: PyMuPdfInfo
}

/** The engine's files, gzipping those that compress well. */
export async function prepareEngine(): Promise<Engine> {
  const assets = join(root, 'assets')
  const served = new Map<string, string>()
  const files: PyMuPdfInfo['files'] = []
  const gzipped: string[] = []
  for (const name of (await readdir(assets)).sort()) {
    const source = join(assets, name)
    if (SCRIPTS.includes(name)) {
      served.set(name, source)
      continue
    }
    const path = compresses(name) ? await gzipOnce(source, GZIP_CACHE) : source
    const servedName = compresses(name) ? `${name}.gz` : name
    if (compresses(name)) gzipped.push(name)
    served.set(servedName, path)
    files.push({ url: PYMUPDF_DIR + servedName, size: (await stat(path)).size })
  }
  return {
    served,
    info: { dir: PYMUPDF_DIR, cache: PYMUPDF_CACHE, files, gzipped },
  }
}

const TYPES: Record<string, string> = {
  js: 'text/javascript',
  json: 'application/json',
  gz: 'application/gzip',
  whl: 'application/zip',
  zip: 'application/zip',
}

export function pymupdf(): Plugin {
  let engine: Engine
  return {
    name: 'tuls:pymupdf',
    async config() {
      engine = await prepareEngine()
      return { define: { __PYMUPDF__: JSON.stringify(engine.info) } }
    },
    configureServer(server) {
      server.middlewares.use(PYMUPDF_DIR, (req, res, next) => {
        const name = (req.url ?? '').slice(1).split('?')[0]
        const path = engine.served.get(name)
        if (!path) return next()
        const extension = name.split('.').pop() ?? ''
        res.setHeader(
          'Content-Type',
          TYPES[extension] ?? 'application/octet-stream',
        )
        createReadStream(path).pipe(res)
      })
    },
    async writeBundle({ dir }) {
      if (!dir) return
      const out = join(dir, PYMUPDF_DIR)
      await mkdir(out, { recursive: true })
      for (const [name, path] of engine.served) {
        await copyFile(path, join(out, name))
      }
    },
  }
}
