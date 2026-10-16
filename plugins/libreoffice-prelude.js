// Put in front of LibreOffice's soffice.js by plugins/libreoffice.ts, so it
// runs inside the engine's workers before the engine itself. The engine's two
// big files are served gzipped (77 MB instead of 250 MB). This reads them
// from the browser cache the page saved them in, if it did, and unpacks them
// on the way in. Every other request goes to the network untouched.
;(() => {
  if (typeof self === 'undefined' || typeof self.fetch !== 'function') return
  if (self.__tulsFetch) return
  self.__tulsFetch = true
  const CACHE = '__TULS_ENGINE_CACHE__'
  const network = self.fetch.bind(self)

  async function fromCache(url) {
    try {
      if (!self.caches) return undefined
      return await (await self.caches.open(CACHE)).match(url)
    } catch {
      return undefined
    }
  }

  // Unpacks gzip, unless it isn't gzip: a host may send .gz files with
  // Content-Encoding, and then the browser has unpacked them already.
  async function unpacked(body) {
    const reader = body.getReader()
    const first = await reader.read()
    const stream = new ReadableStream({
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
      ? stream.pipeThrough(new DecompressionStream('gzip'))
      : stream
  }

  self.fetch = async (input, init) => {
    const href = input instanceof Request ? input.url : String(input)
    const url = new URL(href, self.location.href)
    if (!url.pathname.endsWith('.gz')) return network(input, init)
    const response = (await fromCache(url.href)) ?? (await network(input, init))
    if (!response.ok || !response.body) return response
    const type = url.pathname.endsWith('.wasm.gz')
      ? 'application/wasm'
      : 'application/octet-stream'
    return new Response(await unpacked(response.body), {
      headers: { 'Content-Type': type },
    })
  }
})()
