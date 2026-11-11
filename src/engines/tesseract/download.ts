import { relaxedSimd, simd } from 'wasm-feature-detect'
import { engineCache } from '../engineCache'
import { OcrError } from './errors'

// The engine (one of three builds) and each language are saved on the
// device separately, so a second language only downloads its own file. The
// worker reads them back from there (plugins/tesseract-prelude.js).

let chosen: Promise<(typeof __TESSERACT__.cores)['plain']> | undefined

/** The engine build this browser can run fastest. */
export function coreFile() {
  chosen ??= (async () => {
    const { cores } = __TESSERACT__
    if (await relaxedSimd().catch(() => false)) return cores.relaxedSimd
    if (await simd().catch(() => false)) return cores.simd
    return cores.plain
  })()
  return chosen
}

const cacheOf = (file: { url: string; size: number }) =>
  engineCache({
    cache: __TESSERACT__.cache,
    files: [{ ...file, type: 'application/octet-stream' }],
    oldCopies: /^tuls-tesseract-/,
    error: (kind, cause) =>
      new OcrError(kind === 'network' ? 'network' : 'unknown', cause),
    part: true,
  })

async function parts(language: string) {
  const files = [await coreFile(), __TESSERACT__.languages[language]]
  return files.map((file) => ({ file, cache: cacheOf(file) }))
}

/** How much is still to download for `language`, in bytes: 0 once saved. */
export async function downloadNeeded(language: string) {
  let bytes = 0
  for (const { file, cache } of await parts(language)) {
    if (!(await cache.isSaved())) bytes += file.transfer
  }
  return bytes
}

/**
 * Saves the engine and `language` on the device, reporting how far it's got
 * (0–1). Returns false if the browser won't keep them; the worker then
 * downloads them itself.
 */
export async function saveEngine(
  language: string,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
) {
  const all = await parts(language)
  const total = all.reduce((sum, { file }) => sum + file.size, 0)
  let before = 0
  let kept = true
  for (const { file, cache } of all) {
    const start = before
    kept =
      (await cache.save(
        (ratio) => onProgress((start + ratio * file.size) / total),
        signal,
      )) && kept
    before += file.size
  }
  return kept
}
