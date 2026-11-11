import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../src/engines/tesseract/languages.ts'
import { CORES, prepareEngine, TESSERACT_DIR } from './tesseract.ts'

describe('the text reader’s files', () => {
  it('serves the worker with the prelude in front, and no source map', async () => {
    const { scripts, info } = await prepareEngine()
    const [[name, worker]] = [...scripts]
    expect(info.worker).toBe(TESSERACT_DIR + name)
    expect(name).toMatch(/^worker\.[0-9a-f]{10}\.js$/)
    expect(worker.startsWith('// Goes in front of Tesseract')).toBe(true)
    expect(worker).toContain(`'tuls-tesseract-`)
    expect(worker).not.toContain('__TULS_ENGINE_CACHE__')
    expect(worker).not.toContain('sourceMappingURL')
  })

  it('serves the three engine builds the page picks from', async () => {
    const { files, info } = await prepareEngine()
    for (const [key, file] of Object.entries(CORES)) {
      expect(files.has(file), file).toBe(true)
      const core = info.cores[key as keyof typeof CORES]
      expect(core.url).toBe(TESSERACT_DIR + file)
      expect(core.transfer).toBeLessThan(core.size / 2)
    }
  })

  it('serves every language the page offers, as Tesseract models', async () => {
    const { files, info } = await prepareEngine()
    for (const { code } of LANGUAGES) {
      const name = `${code}.traineddata.gz`
      expect(info.languages[code].url).toBe(TESSERACT_DIR + name)
      const model = gunzipSync(readFileSync(files.get(name)!))
      expect(model.length, code).toBeGreaterThan(info.languages[code].size)
    }
    const english =
      info.languages.eng.transfer + info.cores.relaxedSimd.transfer
    expect(english / 1e6).toBeGreaterThan(3.5)
    expect(english / 1e6).toBeLessThan(5.5)
  })
})
