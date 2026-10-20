// Runs PDF to Word and Compress PDF in a background thread: PyMuPDF and
// pdf2docx, which are Python, through Pyodide (@bentopdf/pymupdf-wasm). The
// package itself would run on the page and freeze it for as long as a
// conversion takes. The package loads Python and its packages; the
// conversion is Tuls's own (tuls_pdf2docx.py), which repairs a PDF's text
// map and fixes how pdf2docx writes fonts, tables, pictures, headers and
// footers. Compress PDF needs only PyMuPDF, so it has a light start, without
// the package's NumPy, OpenCV and pdf2docx, and its own step
// (tuls_compress.py). PDF to Excel uses the light start too, with
// tuls_tables.py. Started by client.ts.
import { PyMuPDF } from '@bentopdf/pymupdf-wasm'
import { cleanDocx } from './cleanDocx'
import { engineFetch } from './fetch'
import officeFonts from './officeFonts.json?raw'
import { progressReader, type Progress } from './progress'
import tulsCompress from './tuls_compress.py?raw'
import tulsPdf2docx from './tuls_pdf2docx.py?raw'
import tulsTables from './tuls_tables.py?raw'
import tulsTextMap from './tuls_text_map.py?raw'

/** How much Compress PDF shrinks images (tuls_compress.py's LEVELS). */
export type CompressLevel = 'recommended' | 'smallest'

/** A table found in a PDF (tuls_tables.py). `null` is a merged cell. */
export type FoundTable = {
  pages: number[]
  rows: (string | null)[][]
  header: number
}

export type WorkerRequest =
  | { id: number; type: 'start'; light?: boolean }
  | { id: number; type: 'convert'; pdf: ArrayBuffer }
  | { id: number; type: 'compress'; pdf: ArrayBuffer; level: CompressLevel }
  | { id: number; type: 'tables'; pdf: ArrayBuffer }
export type WorkerReply =
  | { id: number; type: 'ready' }
  | { id: number; type: 'progress'; progress: Progress }
  | { id: number; type: 'result'; docx: ArrayBuffer; leftOut: number[] }
  | { id: number; type: 'compressed'; pdf: ArrayBuffer }
  | { id: number; type: 'tables'; tables: FoundTable[] }
  | { id: number; type: 'error'; error: string }

type PyCallable = ((...args: unknown[]) => unknown) & { destroy(): void }
type Pyodide = {
  loadPackage(urls: string[]): Promise<void>
  setStderr(options: { batched: (line: string) => void }): void
  setStdout(options: { batched: (line: string) => void }): void
  runPython(code: string): unknown
  globals: { get(name: string): PyCallable }
  FS: {
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
    unlink(path: string): void
  }
}

self.fetch = engineFetch(self.fetch.bind(self), __PYMUPDF__, self.location.href)

// The package and Pyodide report every step on the console. Out of sight,
// as LibreOffice's are; Tuls's own warnings are on the page.
for (const level of ['log', 'info', 'warn'] as const) {
  console[level] = console.debug
}

const engine = new PyMuPDF({ assetPath: __PYMUPDF__.dir })
let started: Promise<Pyodide> | undefined
// pdf2docx's log, read for progress while a PDF converts.
let onLine: (line: string) => void = () => {}

/** Python with only PyMuPDF: what Compress PDF needs, about 23 MB. */
async function startLight(): Promise<Pyodide> {
  const { loadPyodide } = (await import(
    /* @vite-ignore */ `${__PYMUPDF__.dir}pyodide.js`
  )) as { loadPyodide(options: { indexURL: string }): Promise<Pyodide> }
  const pyodide = await loadPyodide({ indexURL: __PYMUPDF__.dir })
  await pyodide.loadPackage([__PYMUPDF__.dir + __PYMUPDF__.wheel])
  return pyodide
}

/** Python with everything the package loads, for PDF to Word too. */
async function startFull(): Promise<Pyodide> {
  await engine.load()
  // Not in the package's types, but it's how to reach Python's output.
  return (engine as unknown as { getPyodide(): Promise<Pyodide> }).getPyodide()
}

/** Each worker starts one way, light or full, the first time it's asked. */
function start(light: boolean) {
  started ??= (async () => {
    const pyodide = await (light ? startLight() : startFull())
    pyodide.setStderr({ batched: (line) => onLine(line) })
    pyodide.setStdout({ batched: () => {} })
    pyodide.runPython('import pymupdf\npymupdf.TOOLS.store_shrink(100)')
    pyodide.runPython(tulsTextMap)
    pyodide.runPython(tulsCompress)
    pyodide.runPython(tulsTables)
    call(pyodide, 'configure_ligatures', officeFonts)
    if (!light) {
      pyodide.runPython(tulsPdf2docx)
      call(pyodide, 'configure', officeFonts)
    }
    return pyodide
  })()
  return started
}

/** Calls one of tuls_pdf2docx.py's functions. */
function call(pyodide: Pyodide, name: string, ...args: unknown[]) {
  const fn = pyodide.globals.get(name)
  try {
    return fn(...args)
  } finally {
    fn.destroy()
  }
}

const INPUT = '/tuls-input.pdf'
const OUTPUT = '/tuls-output.docx'
const COMPRESSED = '/tuls-output.pdf'

const reply = (message: WorkerReply, transfer: Transferable[] = []) =>
  self.postMessage(message, { transfer })

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const pyodide = await start(data.type === 'start' && data.light === true)
    if (data.type === 'start') return reply({ id: data.id, type: 'ready' })
    if (data.type === 'tables') {
      pyodide.FS.writeFile(INPUT, new Uint8Array(data.pdf))
      try {
        const { tables } = JSON.parse(
          String(call(pyodide, 'tables', INPUT)),
        ) as { tables: FoundTable[] }
        return reply({ id: data.id, type: 'tables', tables })
      } finally {
        pyodide.FS.unlink(INPUT)
      }
    }
    if (data.type === 'compress') {
      pyodide.FS.writeFile(INPUT, new Uint8Array(data.pdf))
      try {
        call(pyodide, 'compress', INPUT, COMPRESSED, data.level)
        const pdf = new Uint8Array(pyodide.FS.readFile(COMPRESSED))
        return reply({ id: data.id, type: 'compressed', pdf: pdf.buffer }, [
          pdf.buffer,
        ])
      } finally {
        for (const path of [INPUT, COMPRESSED]) {
          try {
            pyodide.FS.unlink(path)
          } catch {
            // Not made: compressing failed.
          }
        }
      }
    }
    onLine = progressReader((progress) =>
      reply({ id: data.id, type: 'progress', progress }),
    )
    pyodide.FS.writeFile(INPUT, new Uint8Array(data.pdf))
    try {
      const { leftOut } = JSON.parse(
        String(call(pyodide, 'convert', INPUT, OUTPUT)),
      ) as { leftOut: number[] }
      const docx = cleanDocx(pyodide.FS.readFile(OUTPUT))
      reply({ id: data.id, type: 'result', docx: docx.buffer, leftOut }, [
        docx.buffer,
      ])
    } finally {
      for (const path of [INPUT, OUTPUT]) {
        try {
          pyodide.FS.unlink(path)
        } catch {
          // Not made: the conversion failed.
        }
      }
    }
  } catch (e) {
    const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    reply({ id: data.id, type: 'error', error })
  } finally {
    onLine = () => {}
  }
}
