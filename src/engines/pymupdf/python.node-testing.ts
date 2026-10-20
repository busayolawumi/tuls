import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The PDF engine's own Python (Pyodide, with the wheels the browser loads)
// under Node, for the unit tests of Tuls's Python steps (tuls_pdf2docx.py,
// tuls_compress.py). Node-only, so it's checked with the tests' settings.

export type Python = {
  runPython(code: string): unknown
  globals: { get(name: string): (...args: unknown[]) => unknown }
  FS: {
    writeFile(path: string, data: Uint8Array | string): void
    readFile(path: string): Uint8Array
  }
}

/** PDF to Word's wheels: everything the package loads. */
export const ALL_WHEELS =
  /^(pymupdf|fonttools|lxml|numpy|opencv_python|pdf2docx|python_docx|typing_extensions)-.*\.whl$/
/** Compress PDF's light start: PyMuPDF only. */
export const PYMUPDF_ONLY = /^pymupdf-.*\.whl$/

/** Pyodide with the wheels matching `wheels`, and Tuls's `modules` run in it. */
export async function loadPython(
  wheels: RegExp,
  modules: string[],
): Promise<Python> {
  const assets = join(
    dirname(
      dirname(fileURLToPath(import.meta.resolve('@bentopdf/pymupdf-wasm'))),
    ),
    'assets',
  )
  // The package says its files are ES modules, but Pyodide's own script
  // isn't one, and Node goes by the nearest package.json: a folder of its
  // own, with the big files linked rather than copied.
  const folder = mkdtempSync(join(tmpdir(), 'tuls-pyodide-'))
  for (const name of readdirSync(assets)) {
    const copy = name === 'pyodide.asm.js' ? copyFileSync : symlinkSync
    copy(join(assets, name), join(folder, name))
  }
  writeFileSync(join(folder, 'package.json'), '{"type":"commonjs"}')
  // Without its source map comment, which points at a file not shipped.
  writeFileSync(
    join(folder, 'pyodide.mjs'),
    readFileSync(join(assets, 'pyodide.js'), 'utf8').replace(
      /\/\/# sourceMappingURL=.*$/m,
      '',
    ),
  )
  const { loadPyodide } = (await import(join(folder, 'pyodide.mjs'))) as {
    loadPyodide(options: object): Promise<
      Python & {
        loadPackage(urls: string[], options: object): Promise<void>
      }
    >
  }
  const python = await loadPyodide({
    indexURL: `${folder}/`,
    stdout: () => {},
    stderr: () => {},
  })
  await python.loadPackage(
    readdirSync(assets)
      .filter((name) => wheels.test(name))
      .map((name) => join(folder, name)),
    { messageCallback: () => {} },
  )
  const here = dirname(fileURLToPath(import.meta.url))
  for (const module of modules) {
    python.runPython(readFileSync(join(here, module), 'utf8'))
  }
  return python
}
