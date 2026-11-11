import { createHash } from 'node:crypto'
import { createReadStream, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'
import { LANGUAGES } from '../src/engines/tesseract/languages.ts'

// Tesseract (text recognition) for OCR PDF, as tesseract.js builds it for the
// browser. Served from /engines/tesseract-<version>/, which vercel.json
// caches for good:
//
// - the worker script, with plugins/tesseract-prelude.js in front
// - the engine, in its three builds for what the browser's WebAssembly can
//   do (the page picks one)
// - one file per language, from @tesseract.js-data, gzipped as they come

const packageDir = (name: string) =>
  dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)))

const version = (dir: string) =>
  (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      version: string
    }
  ).version

const tesseractJs = packageDir('tesseract.js')
const core = packageDir('tesseract.js-core')

export const TESSERACT_VERSION = version(tesseractJs)
export const TESSERACT_DIR = `/engines/tesseract-${TESSERACT_VERSION}/`
/** The browser cache the page keeps the engine in, one per version. */
export const TESSERACT_CACHE = `tuls-tesseract-${TESSERACT_VERSION}`

// "Best int": the accurate models, stored small. Only the line reader (LSTM)
// is used, so the engines are the -lstm builds.
const MODELS = '4.0.0_best_int'
export const CORES = {
  relaxedSimd: 'tesseract-core-relaxedsimd-lstm.wasm.js',
  simd: 'tesseract-core-simd-lstm.wasm.js',
  plain: 'tesseract-core-lstm.wasm.js',
} as const

/** A file to download: where, its size as it arrives, and its download size. */
type Download = { url: string; size: number; transfer: number }

export type TesseractInfo = {
  dir: string
  cache: string
  /** The worker script tesseract.js starts. */
  worker: string
  cores: Record<keyof typeof CORES, Download>
  /** By Tesseract's code, e.g. "eng". */
  languages: Record<string, Download>
}

type Engine = {
  /** Served file names in TESSERACT_DIR, and their text or path on disk. */
  scripts: Map<string, string>
  files: Map<string, string>
  info: TesseractInfo
}

export async function prepareEngine(): Promise<Engine> {
  const prelude = (
    await readFile(new URL('./tesseract-prelude.js', import.meta.url), 'utf8')
  ).replace('__TULS_ENGINE_CACHE__', TESSERACT_CACHE)
  const original = await readFile(
    join(tesseractJs, 'dist/worker.min.js'),
    'utf8',
  )
  const worker = `${prelude};\n${original.replace(/\n\/\/# sourceMappingURL=.*$/, '')}`
  const hash = createHash('sha256').update(worker).digest('hex').slice(0, 10)
  const workerName = `worker.${hash}.js`

  const files = new Map<string, string>()
  const cores = {} as TesseractInfo['cores']
  for (const [key, name] of Object.entries(CORES)) {
    const path = join(core, name)
    const bytes = await readFile(path)
    files.set(name, path)
    cores[key as keyof typeof CORES] = {
      url: TESSERACT_DIR + name,
      size: bytes.length,
      // The host compresses scripts on the way, about as well as this.
      transfer: gzipSync(bytes, { level: 9 }).length,
    }
  }

  const languages: TesseractInfo['languages'] = {}
  for (const { code } of LANGUAGES) {
    const name = `${code}.traineddata.gz`
    const path = join(packageDir(`@tesseract.js-data/${code}`), MODELS, name)
    const size = (await stat(path)).size
    files.set(name, path)
    languages[code] = { url: TESSERACT_DIR + name, size, transfer: size }
  }

  return {
    scripts: new Map([[workerName, worker]]),
    files,
    info: {
      dir: TESSERACT_DIR,
      cache: TESSERACT_CACHE,
      worker: TESSERACT_DIR + workerName,
      cores,
      languages,
    },
  }
}

export function tesseract(): Plugin {
  let engine: Engine
  return {
    name: 'tuls:tesseract',
    async config() {
      engine = await prepareEngine()
      return { define: { __TESSERACT__: JSON.stringify(engine.info) } }
    },
    configureServer(server) {
      server.middlewares.use(TESSERACT_DIR, (req, res, next) => {
        const name = (req.url ?? '').slice(1).split('?')[0]
        const script = engine.scripts.get(name)
        if (script !== undefined) {
          res.setHeader('Content-Type', 'text/javascript')
          res.end(script)
          return
        }
        const path = engine.files.get(name)
        if (!path) return next()
        res.setHeader(
          'Content-Type',
          name.endsWith('.js') ? 'text/javascript' : 'application/gzip',
        )
        createReadStream(path).pipe(res)
      })
    },
    async writeBundle({ dir }) {
      if (!dir) return
      const out = join(dir, TESSERACT_DIR)
      await mkdir(out, { recursive: true })
      for (const [name, text] of engine.scripts) {
        await writeFile(join(out, name), text)
      }
      for (const [name, path] of engine.files) {
        await copyFile(path, join(out, name))
      }
    },
  }
}
