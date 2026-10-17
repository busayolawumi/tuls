import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
} from 'node:fs'
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { zipSync } from 'fflate'
import type { Plugin } from 'vite'
import { CODE_POINTS, fontWidths, type FontWidths } from './font-metrics.ts'
import { FREE_FONTS, freeFontFiles } from './libreoffice-fonts/free.ts'
import { substituteAliases } from './libreoffice-fonts/substitutes.ts'

// LibreOffice compiled to WebAssembly (@matbee/libreoffice-converter), for
// the Word, Excel and PowerPoint tools. Its files are served as they are, not
// bundled, because the engine starts its own workers from them. This plugin
//
// - patches two of them (see patchSoffice and patchWorker), and names those
//   after their contents, so a changed patch never meets an old cached copy,
// - gzips the two big ones, once, into node_modules/.cache. Vercel would send
//   soffice.data uncompressed and compresses soffice.wasm only lightly, and
//   only Safari and Firefox can unpack Brotli in a page (CLAUDE.md),
// - packs Tuls's free fonts (libreoffice-fonts/free.ts) into one ZIP, which
//   downloads and is kept with the big files,
// - serves them in development, and copies them into the build under
//   /engines/libreoffice-<version>/, which vercel.json caches for good and
//   gives the engine's own privacy policy.

const require = createRequire(import.meta.url)
const root = dirname(
  require.resolve('@matbee/libreoffice-converter/package.json'),
)
const { version } = require('@matbee/libreoffice-converter/package.json') as {
  version: string
}

export const ENGINE_DIR = `/engines/libreoffice-${version}/`
/** The browser cache the page keeps the big files in, one per version. */
export const ENGINE_CACHE = `tuls-libreoffice-${version}`
const BIG = ['soffice.wasm', 'soffice.data']
const GZIP_CACHE = fileURLToPath(
  new URL(`../node_modules/.cache/${ENGINE_CACHE}/`, import.meta.url),
)

/** Replaces `find` with `replacement`, if it's there exactly once. */
export function replaceOnce(
  text: string,
  find: string,
  replacement: string,
  what: string,
) {
  const at = text.indexOf(find)
  if (at === -1 || text.includes(find, at + 1)) {
    throw new Error(
      `LibreOffice engine ${version}: couldn't find the ${what} exactly once. ` +
        'Check the patches in plugins/libreoffice.ts against the new version.',
    )
  }
  return text.slice(0, at) + replacement + text.slice(at + find.length)
}

// The maps aren't shipped, so the comments would only make the browser's
// developer tools ask for missing files.
const withoutSourceMaps = (text: string) =>
  text.replace(/\/\/# sourceMappingURL=\S*/g, '')

/**
 * The engine itself (Emscripten's soffice.js), with the fetch wrapper from
 * libreoffice-prelude.js in front, and 8 threads ready from the start. With
 * the stock 4, starting a thread mid-conversion can deadlock; 16 crashed an
 * iPhone tab (CLAUDE.md, spike results).
 */
export function patchSoffice(text: string, prelude: string) {
  const patched = replaceOnce(
    text,
    'var pthreadPoolSize=4;',
    'var pthreadPoolSize=8;',
    'thread pool size',
  )
  return `${prelude}\n${withoutSourceMaps(patched)}`
}

/**
 * The converter's worker, changed in four places:
 *
 * - It gives up if starting takes 2 minutes, and that includes the download
 *   when the engine isn't saved yet, so a slow connection would always fail.
 *   Allow 10: Tuls has its own limits.
 * - LibreOffice's hundreds of log lines go to console.debug (the console's
 *   "Verbose" level), not console.error.
 * - Documents open in the visitor's language and region (`language` in the
 *   convert message), so what Office leaves to the computer's settings
 *   comes out as their Office would show it: the paper size of
 *   spreadsheets that don't say, and dates in the "short date" format.
 * - Text documents have their tracked changes accepted before saving. The
 *   PDF would otherwise print deleted text, struck through, which people
 *   believe is gone (CLAUDE.md). `d` is the document and `g` its type, 0
 *   for text, in the converter's own code.
 */
export function patchWorker(text: string) {
  let patched = replaceOnce(
    text,
    'setTimeout(()=>d(new Error("WASM initialization timeout")),12e4)',
    'setTimeout(()=>d(new Error("WASM initialization timeout")),6e5)',
    'start-up time limit',
  )
  patched = replaceOnce(
    patched,
    'print:console.log,printErr:console.error}',
    'print:console.debug,printErr:console.debug}',
    'log setting',
  )
  patched = replaceOnce(
    patched,
    'let m=M(t,o);if(m?d=c.documentLoadWithOptions(s,m):d=c.documentLoad(s)',
    'let m=[M(t,o),l.language?"Language="+l.language:""].filter(Boolean).join(",");if(m?d=c.documentLoadWithOptions(s,m):d=c.documentLoad(s)',
    'document load',
  )
  patched = replaceOnce(
    patched,
    'L(l.id,70,"Saving..."),c.documentSaveAs(d,a,f,O)',
    `L(l.id,70,"Saving..."),g===0&&(c.documentInitializeForRendering(d,"{}"),c.setView(d,c.getView(d)),c.postUnoCommand(d,".uno:AcceptAllTrackedChanges",'{"SynchronMode":{"type":"boolean","value":"true"}}')),c.documentSaveAs(d,a,f,O)`,
    'save step',
  )
  return withoutSourceMaps(patched)
}

/** Gzips a big file once per version, reusing it on later builds. */
async function gzipped(name: string) {
  const target = join(GZIP_CACHE, `${name}.gz`)
  if (existsSync(target)) return target
  await mkdir(GZIP_CACHE, { recursive: true })
  const partial = `${target}.${process.pid}.partial`
  await pipeline(
    createReadStream(join(root, 'wasm', name)),
    createGzip({ level: 9 }),
    createWriteStream(partial),
  )
  await rename(partial, target)
  return target
}

// Fonts LibreOffice gets when it starts (see libreoffice-fonts/README.md).
const EXTRA_FONTS = ['StandardSymbolsPS-Symbol.ttf']
// LibreOffice's font aliases, with Tuls's added (libreoffice-fonts/substitutes.ts).
const FONT_CONFIG = '/instdir/share/fonts/truetype/fc_local.conf'

/** The files in the engine's data, by path: where each starts and ends. */
function engineFiles(sofficeJs: string) {
  return new Map(
    [...sofficeJs.matchAll(/\{filename:"([^"]+)",start:(\d+),end:(\d+)/g)].map(
      (m) => [m[1], [Number(m[2]), Number(m[3])]] as const,
    ),
  )
}

/** One file from the engine's data. */
async function engineFile(sofficeJs: string, path: string) {
  const range = engineFiles(sofficeJs).get(path)
  if (!range) throw new Error(`LibreOffice engine ${version}: no ${path}`)
  const data = await open(join(root, 'wasm/soffice.data'))
  try {
    const file = Buffer.alloc(range[1] - range[0])
    await data.read(file, 0, file.length, range[0])
    return file
  } finally {
    await data.close()
  }
}

/**
 * Tuls's free fonts in one ZIP, compressed (Vercel doesn't compress ZIPs).
 * The date inside is fixed, so the same fonts make the same file and name.
 */
export function freeFontPack() {
  const files: Record<string, Uint8Array> = {}
  for (const font of FREE_FONTS) {
    for (const path of freeFontFiles(font)) {
      files[path.split('/').pop()!] = new Uint8Array(
        readFileSync(require.resolve(path)),
      )
    }
  }
  return Buffer.from(
    zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') }),
  )
}

/** LibreOffice's fc_local.conf with Tuls's aliases added at the end. */
export async function fontConfig() {
  const sofficeJs = await readFile(join(root, 'wasm/soffice.js'), 'utf8')
  const original = (await engineFile(sofficeJs, FONT_CONFIG)).toString('utf8')
  return replaceOnce(
    original,
    '</fontconfig>',
    `${substituteAliases()}</fontconfig>`,
    'end of fc_local.conf',
  )
}

// The engine's stand-ins for Office fonts, whose widths Tuls measures text
// with (virtual:tuls/font-metrics), by family and their files' names.
const MEASURED_FONTS: Record<string, string> = {
  'Liberation Serif': 'LiberationSerif',
  'Liberation Sans': 'LiberationSans',
  'Liberation Mono': 'LiberationMono',
  'Liberation Sans Narrow': 'LiberationSansNarrow',
  Carlito: 'Carlito',
  Caladea: 'Caladea',
}
const STYLES = {
  regular: 'Regular',
  bold: 'Bold',
  italic: 'Italic',
  boldItalic: 'BoldItalic',
}
export type FontMetrics = {
  codePoints: number[]
  fonts: Record<string, Record<keyof typeof STYLES, FontWidths>>
}

/** Character widths of the measured fonts, read from the engine's data. */
export async function engineFontMetrics(): Promise<FontMetrics> {
  const sofficeJs = await readFile(join(root, 'wasm/soffice.js'), 'utf8')
  const files = engineFiles(sofficeJs)
  const data = await open(join(root, 'wasm/soffice.data'))
  try {
    const fonts: FontMetrics['fonts'] = {}
    for (const [family, file] of Object.entries(MEASURED_FONTS)) {
      const styles = {} as FontMetrics['fonts'][string]
      for (const [style, suffix] of Object.entries(STYLES)) {
        const path = `/instdir/share/fonts/truetype/${file}-${suffix}.ttf`
        const range = files.get(path)
        if (!range) throw new Error(`LibreOffice engine ${version}: no ${path}`)
        const font = Buffer.alloc(range[1] - range[0])
        await data.read(font, 0, font.length, range[0])
        styles[style as keyof typeof STYLES] = fontWidths(font)
      }
      fonts[family] = styles
    }
    return { codePoints: CODE_POINTS, fonts }
  } finally {
    await data.close()
  }
}

const METRICS_ID = 'virtual:tuls/font-metrics'

type Engine = {
  /** Small files, patched, by their name in ENGINE_DIR. */
  scripts: Map<string, string>
  /** The gzipped big files on disk, by their name in ENGINE_DIR. */
  big: Map<string, string>
  /** Extra fonts, the font settings and the free fonts' ZIP, by name. */
  fonts: Map<string, Buffer>
  metrics: FontMetrics
  /** What the app needs to know (__LIBREOFFICE__). */
  info: LibreOfficeInfo
}

export type LibreOfficeInfo = {
  /** The converter's worker, which loads the rest. */
  worker: string
  soffice: string
  sofficeWorker: string
  wasm: string
  data: string
  /** Download sizes in bytes, for progress. */
  wasmSize: number
  dataSize: number
  cache: string
  /**
   * Files for LibreOffice's fonts folder (extra fonts, and fc_local.conf):
   * where they are, and their file names there.
   */
  fonts: { url: string; name: string }[]
  /** The free fonts' ZIP, also for the fonts folder, and its size. */
  fontPack: string
  fontPackSize: number
}

async function prepare(): Promise<Engine> {
  const prelude = (
    await readFile(new URL('./libreoffice-prelude.js', import.meta.url), 'utf8')
  ).replace('__TULS_ENGINE_CACHE__', ENGINE_CACHE)
  const read = (path: string) => readFile(join(root, path), 'utf8')
  const sources = {
    worker: patchWorker(await read('dist/browser.worker.global.js')),
    soffice: patchSoffice(await read('wasm/soffice.js'), prelude),
    sofficeWorker: await read('wasm/soffice.worker.js'),
  }
  const fonts = new Map<string, Buffer>()
  const fontInfo: LibreOfficeInfo['fonts'] = []
  for (const name of EXTRA_FONTS) {
    const font = await readFile(
      new URL(`./libreoffice-fonts/${name}`, import.meta.url),
    )
    const fontHash = createHash('sha256')
      .update(font)
      .digest('hex')
      .slice(0, 10)
    const served = name.replace(/\.ttf$/, `.${fontHash}.ttf`)
    fonts.set(served, font)
    fontInfo.push({ url: ENGINE_DIR + served, name })
  }
  const config = Buffer.from(await fontConfig())
  const configHash = createHash('sha256')
    .update(config)
    .digest('hex')
    .slice(0, 10)
  fonts.set(`fc_local.${configHash}.conf`, config)
  const pack = freeFontPack()
  const packName = `fonts.${createHash('sha256').update(pack).digest('hex').slice(0, 10)}.zip`
  fonts.set(packName, pack)
  fontInfo.push({
    url: `${ENGINE_DIR}fc_local.${configHash}.conf`,
    name: 'fc_local.conf',
  })
  const hash = createHash('sha256')
    .update(Object.values(sources).join('\0'))
    .digest('hex')
    .slice(0, 10)
  const names = {
    worker: `worker.${hash}.js`,
    soffice: `soffice.${hash}.js`,
    sofficeWorker: `soffice.worker.${hash}.js`,
  }
  const [wasm, data] = await Promise.all(BIG.map(gzipped))
  return {
    scripts: new Map([
      [names.worker, sources.worker],
      [names.soffice, sources.soffice],
      [names.sofficeWorker, sources.sofficeWorker],
    ]),
    big: new Map([
      ['soffice.wasm.gz', wasm],
      ['soffice.data.gz', data],
    ]),
    fonts,
    metrics: await engineFontMetrics(),
    info: {
      worker: ENGINE_DIR + names.worker,
      soffice: ENGINE_DIR + names.soffice,
      sofficeWorker: ENGINE_DIR + names.sofficeWorker,
      wasm: `${ENGINE_DIR}soffice.wasm.gz`,
      data: `${ENGINE_DIR}soffice.data.gz`,
      wasmSize: (await stat(wasm)).size,
      dataSize: (await stat(data)).size,
      cache: ENGINE_CACHE,
      fonts: fontInfo,
      fontPack: ENGINE_DIR + packName,
      fontPackSize: pack.length,
    },
  }
}

export function libreOffice(): Plugin {
  let engine: Engine
  return {
    name: 'tuls:libreoffice',
    async config() {
      engine = await prepare()
      return { define: { __LIBREOFFICE__: JSON.stringify(engine.info) } }
    },
    // The widths, for the app to import only when a document needs them.
    resolveId(id) {
      if (id === METRICS_ID) return `\0${METRICS_ID}`
    },
    load(id) {
      if (id === `\0${METRICS_ID}`) {
        return `export default ${JSON.stringify(engine.metrics)}`
      }
    },
    configureServer(server) {
      server.middlewares.use(ENGINE_DIR, (req, res, next) => {
        const name = (req.url ?? '').slice(1).split('?')[0]
        const script = engine.scripts.get(name)
        if (script !== undefined) {
          res.setHeader('Content-Type', 'text/javascript')
          res.end(script)
          return
        }
        const font = engine.fonts.get(name)
        if (font) {
          res.setHeader(
            'Content-Type',
            name.endsWith('.conf')
              ? 'text/plain'
              : name.endsWith('.zip')
                ? 'application/zip'
                : 'font/ttf',
          )
          res.end(font)
          return
        }
        const big = engine.big.get(name)
        if (!big) return next()
        res.setHeader('Content-Type', 'application/gzip')
        createReadStream(big).pipe(res)
      })
    },
    async writeBundle({ dir }) {
      if (!dir) return
      const out = join(dir, ENGINE_DIR)
      await mkdir(out, { recursive: true })
      for (const [name, text] of engine.scripts) {
        await writeFile(join(out, name), text)
      }
      for (const [name, path] of engine.big) {
        await copyFile(path, join(out, name))
      }
      for (const [name, font] of engine.fonts) {
        await writeFile(join(out, name), font)
      }
    },
  }
}
