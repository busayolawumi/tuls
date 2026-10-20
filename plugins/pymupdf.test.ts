import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PYMUPDF_DIR, prepareEngine } from './pymupdf.ts'

const packageJs = readFileSync(
  fileURLToPath(import.meta.resolve('@bentopdf/pymupdf-wasm')),
  'utf8',
)

describe('the PDF to Word engine’s files', () => {
  it('serves every file the package loads, from its own folder', async () => {
    const { served, info } = await prepareEngine()
    const wheels = JSON.parse(
      /wheels: (\[[^\]]*\])/.exec(packageJs)![1].replace(/,\s*\]/, ']'),
    ) as string[]
    for (const name of ['pyodide.js', 'pyodide.asm.js']) {
      expect(served.has(name), name).toBe(true)
    }
    for (const name of [
      ...wheels,
      'pyodide.asm.wasm',
      'python_stdlib.zip',
      'pyodide-lock.json',
    ]) {
      const servedName = info.gzipped.includes(name) ? `${name}.gz` : name
      expect(served.has(servedName), name).toBe(true)
      expect(
        info.files.some((file) => file.url === PYMUPDF_DIR + servedName),
        name,
      ).toBe(true)
    }
  })

  it('lists a light start’s files: Python and PyMuPDF only, about 23 MB', async () => {
    const { info } = await prepareEngine()
    const names = info.light.map((url) => url.slice(PYMUPDF_DIR.length))
    expect(names.sort()).toEqual([
      info.wheel,
      'pyodide-lock.json',
      'pyodide.asm.wasm.gz',
      'python_stdlib.zip',
    ])
    expect(info.wheel).toMatch(/^pymupdf-.*\.whl$/)
    const size = info.files
      .filter((file) => info.light.includes(file.url))
      .reduce((sum, file) => sum + file.size, 0)
    expect(size / 1e6).toBeGreaterThan(20)
    expect(size / 1e6).toBeLessThan(25)
  })

  it('gzips only what compresses well', async () => {
    const { info } = await prepareEngine()
    expect(info.gzipped).toEqual([
      expect.stringMatching(/^numpy-.*\.whl$/),
      'pyodide.asm.wasm',
    ])
    // About 40 MB to download the first time.
    const total = info.files.reduce((sum, file) => sum + file.size, 0)
    expect(total).toBeGreaterThan(35_000_000)
    expect(total).toBeLessThan(45_000_000)
  })

  it('never names Ghostscript, so the package can’t load it from elsewhere', () => {
    // pdfToDocx only imports Ghostscript from `ghostscriptUrl`; Tuls leaves it
    // unset (src/engines/pymupdf/worker.ts).
    const worker = readFileSync(
      new URL('../src/engines/pymupdf/worker.ts', import.meta.url),
      'utf8',
    )
    expect(worker).not.toContain('ghostscript')
    expect(packageJs).toContain(
      'this.ghostscriptUrl = options?.ghostscriptUrl ?? ""',
    )
  })
})
