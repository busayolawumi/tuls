// Inside the PDF to Word worker, Pyodide fetches its runtime and Python
// packages from the engine's folder (plugins/pymupdf.ts). This reads them
// from the copy the page saved on the device (engineCache.ts), or the
// network, and unpacks the ones served gzipped. Other requests go to the
// network untouched.

export type EngineFolder = {
  /** Where the engine is served, e.g. /engines/pymupdf-0.11.16/. */
  dir: string
  /** The browser cache the page saved it in. */
  cache: string
  /** Files served gzipped, by the name Pyodide asks for (without .gz). */
  gzipped: string[]
}

const TYPES: Record<string, string> = {
  wasm: 'application/wasm',
  json: 'application/json',
}

/** Unpacks gzip, unless a host sent it unpacked already (Content-Encoding). */
async function unpacked(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const first = await reader.read()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close()
      else controller.enqueue(first.value)
    },
    async pull(controller) {
      const next = await reader.read()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    cancel(reason) {
      return reader.cancel(reason)
    },
  })
  const head = first.value
  const gzipped = !!head && head[0] === 0x1f && head[1] === 0x8b
  return gzipped
    ? stream.pipeThrough(
        new DecompressionStream('gzip') as ReadableWritablePair<
          Uint8Array,
          Uint8Array
        >,
      )
    : stream
}

/**
 * A fetch for the worker: `network` is the real one, and `base` the
 * worker's address, for relative ones.
 */
export function engineFetch(
  network: typeof fetch,
  folder: EngineFolder,
  base: string,
): typeof fetch {
  async function fromCache(href: string) {
    try {
      if (typeof caches === 'undefined') return undefined
      return await (await caches.open(folder.cache)).match(href)
    } catch {
      return undefined
    }
  }

  return async (input, init) => {
    const href = input instanceof Request ? input.url : String(input)
    const url = new URL(href, base)
    if (!url.pathname.startsWith(folder.dir)) return network(input, init)
    const name = url.pathname.slice(folder.dir.length)
    const gzipped = folder.gzipped.includes(name)
    const served = new URL(folder.dir + (gzipped ? `${name}.gz` : name), url)
    // An integrity check would be of the unpacked file, not what's served.
    const { integrity: _, ...rest } = init ?? {}
    const response =
      (await fromCache(served.href)) ?? (await network(served.href, rest))
    if (!response.ok || !response.body) return response
    return new Response(
      gzipped ? await unpacked(response.body) : response.body,
      {
        headers: {
          'Content-Type':
            TYPES[name.split('.').pop() ?? ''] ?? 'application/octet-stream',
        },
      },
    )
  }
}
