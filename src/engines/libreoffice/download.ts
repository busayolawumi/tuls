import { OfficeError } from './errors'

// LibreOffice's two big files (77 MB gzipped) are saved in the browser's
// Cache Storage, under a name for this version, so they download once. The
// engine's own fetch wrapper (plugins/libreoffice-prelude.js) reads them from
// there. Saving them first, here, also means the download can show progress,
// and the engine's start-up time limit doesn't include it.

const FILES = [
  { url: __LIBREOFFICE__.wasm, size: __LIBREOFFICE__.wasmSize },
  { url: __LIBREOFFICE__.data, size: __LIBREOFFICE__.dataSize },
]

/** The first-time download, in bytes. */
export const DOWNLOAD_SIZE = FILES.reduce((sum, file) => sum + file.size, 0)

const OLD_COPIES = /^tuls-libreoffice-/

/** Tuls's cache, if this browser lets the page keep one. */
async function openCache() {
  try {
    if (!('caches' in self)) return undefined
    return await caches.open(__LIBREOFFICE__.cache)
  } catch {
    // Some private modes refuse, and plain http has no Cache Storage.
    return undefined
  }
}

/** Whether the engine is saved on this device already. */
export async function isEngineSaved() {
  const cache = await openCache()
  if (!cache) return false
  try {
    for (const file of FILES) {
      if (!(await cache.match(file.url))) return false
    }
    return true
  } catch {
    return false
  }
}

/** Frees the space older versions of the engine took. */
async function removeOldCopies() {
  try {
    for (const name of await caches.keys()) {
      if (OLD_COPIES.test(name) && name !== __LIBREOFFICE__.cache) {
        await caches.delete(name)
      }
    }
  } catch {
    // Only tidying up.
  }
}

/**
 * Saves the engine's big files on this device, reporting how far it's got
 * (0–1). Returns false if the browser won't keep them; the engine then
 * downloads them itself when it starts, with no progress to show.
 */
export async function saveEngine(
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const cache = await openCache()
  if (!cache) return false
  void removeOldCopies()
  let saved = 0
  for (const file of FILES) {
    if (await cache.match(file.url)) {
      saved += file.size
      continue
    }
    let response: Response
    try {
      response = await fetch(file.url, { signal })
    } catch (e) {
      throw new OfficeError(signal?.aborted ? 'unknown' : 'network', e)
    }
    if (!response.ok || !response.body) {
      throw new OfficeError('network', `${response.status} ${file.url}`)
    }
    let received = 0
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength
          onProgress(Math.min((saved + received) / DOWNLOAD_SIZE, 1))
          controller.enqueue(chunk)
        },
      }),
    )
    try {
      await cache.put(
        file.url,
        new Response(counted, {
          headers: { 'Content-Type': 'application/gzip' },
        }),
      )
    } catch (e) {
      // Out of space: let the engine download them itself.
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        return false
      }
      throw new OfficeError(signal?.aborted ? 'unknown' : 'network', e)
    }
    saved += file.size
  }
  onProgress(1)
  return true
}
