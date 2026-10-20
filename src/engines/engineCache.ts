// Big engines (LibreOffice, PyMuPDF) are saved in the browser's Cache
// Storage, under a name for their version, so they download once. Saving
// them before the engine starts also means the download can show progress,
// and the engine's start-up time limit doesn't include it. Each engine reads
// its files back from there, or from the network if the browser won't keep
// them.

/** A file to save: where it's served, its size (for progress), its type. */
export type EngineFile = { url: string; size: number; type: string }

/** Why saving failed: the connection, or the download was stopped. */
export type SaveFailure = 'network' | 'unknown'

type Options = {
  /** The cache's name, one per version, e.g. tuls-libreoffice-2.7.2. */
  cache: string
  files: EngineFile[]
  /** Other versions' caches, whose space is freed, e.g. /^tuls-libreoffice-/. */
  oldCopies: RegExp
  /** The engine's own error for a failed download. */
  error: (kind: SaveFailure, cause: unknown) => Error
  /**
   * Only some of the engine's files (PyMuPDF's light start): the cache's
   * other files belong to the whole engine, so they're kept.
   */
  part?: boolean
}

export function engineCache({
  cache: name,
  files,
  oldCopies,
  error,
  part = false,
}: Options) {
  /** The first-time download, in bytes. */
  const size = files.reduce((sum, file) => sum + file.size, 0)

  /** The cache, if this browser lets the page keep one. */
  async function open() {
    try {
      if (!('caches' in self)) return undefined
      return await caches.open(name)
    } catch {
      // Some private modes refuse, and plain http has no Cache Storage.
      return undefined
    }
  }

  /**
   * Frees the space older versions took, and files this version no longer
   * uses (e.g. fonts packed differently since).
   */
  async function removeOldCopies(cache: Cache) {
    try {
      for (const other of await caches.keys()) {
        if (oldCopies.test(other) && other !== name) await caches.delete(other)
      }
      if (part) return
      const current = files.map((file) => new URL(file.url, location.href).href)
      for (const request of await cache.keys()) {
        if (!current.includes(request.url)) await cache.delete(request)
      }
    } catch {
      // Only tidying up.
    }
  }

  return {
    size,

    /** Whether the engine is saved on this device already. */
    async isSaved() {
      const cache = await open()
      if (!cache) return false
      try {
        for (const file of files) {
          if (!(await cache.match(file.url))) return false
        }
        return true
      } catch {
        return false
      }
    },

    /** One of the saved files, or from the network if it isn't saved. */
    async file(url: string) {
      const cache = await open()
      const saved = await cache?.match(url).catch(() => undefined)
      const response = saved ?? (await fetch(url))
      if (!response.ok) throw error('network', `${response.status} ${url}`)
      return response
    },

    /**
     * Saves the engine's files on this device, reporting how far it's got
     * (0–1). Returns false if the browser won't keep them; the engine then
     * downloads them itself as it starts, with no progress to show.
     */
    async save(
      onProgress: (ratio: number) => void,
      signal?: AbortSignal,
    ): Promise<boolean> {
      const cache = await open()
      if (!cache) return false
      void removeOldCopies(cache)
      let saved = 0
      for (const file of files) {
        if (await cache.match(file.url)) {
          saved += file.size
          continue
        }
        let response: Response
        try {
          response = await fetch(file.url, { signal })
        } catch (e) {
          throw error(signal?.aborted ? 'unknown' : 'network', e)
        }
        if (!response.ok || !response.body) {
          throw error('network', `${response.status} ${file.url}`)
        }
        let received = 0
        const counted = response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              received += chunk.byteLength
              onProgress(Math.min((saved + received) / size, 1))
              controller.enqueue(chunk)
            },
          }),
        )
        try {
          await cache.put(
            file.url,
            new Response(counted, { headers: { 'Content-Type': file.type } }),
          )
        } catch (e) {
          // Out of space: let the engine download them itself.
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            return false
          }
          throw error(signal?.aborted ? 'unknown' : 'network', e)
        }
        saved += file.size
      }
      onProgress(1)
      return true
    },
  }
}
