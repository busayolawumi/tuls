import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { patchSoffice, patchWorker, replaceOnce } from './libreoffice.ts'

const require = createRequire(import.meta.url)
const root = dirname(
  require.resolve('@matbee/libreoffice-converter/package.json'),
)
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const prelude = readFileSync(
  new URL('./libreoffice-prelude.js', import.meta.url),
  'utf8',
)

describe('patching the engine', () => {
  it('replaces something only when it is there exactly once', () => {
    expect(replaceOnce('a-b-c', 'b', 'x', 'b')).toBe('a-x-c')
    expect(() => replaceOnce('a-c', 'b', 'x', 'b')).toThrow(/exactly once/)
    expect(() => replaceOnce('b-b', 'b', 'x', 'b')).toThrow(/exactly once/)
  })

  it('gives the engine 8 threads and the fetch wrapper', () => {
    const patched = patchSoffice(read('wasm/soffice.js'), prelude)
    expect(patched.startsWith(prelude)).toBe(true)
    expect(patched.includes('var pthreadPoolSize=8;')).toBe(true)
    expect(patched.includes('var pthreadPoolSize=4;')).toBe(false)
  })

  it('accepts tracked changes in text documents before saving', () => {
    const patched = patchWorker(read('dist/browser.worker.global.js'))
    expect(
      patched.includes(
        `g===0&&(c.documentInitializeForRendering(d,"{}"),c.setView(d,c.getView(d)),c.postUnoCommand(d,".uno:AcceptAllTrackedChanges",'{"SynchronMode":{"type":"boolean","value":"true"}}')),c.documentSaveAs(d,a,f,O)`,
      ),
    ).toBe(true)
  })

  it("allows a slow first start, and quiets LibreOffice's log", () => {
    const patched = patchWorker(read('dist/browser.worker.global.js'))
    expect(patched.includes('"WASM initialization timeout")),6e5)')).toBe(true)
    expect(
      patched.includes('print:console.debug,printErr:console.debug}'),
    ).toBe(true)
    expect(patched.includes('sourceMappingURL')).toBe(false)
  })
})

/** Runs the prelude in a pretend worker, returning its fetch. */
function workerFetch(
  network: (url: string) => Promise<Response>,
  saved: Record<string, Response> = {},
) {
  const scope = {
    fetch: async (input: string) => network(input),
    location: { href: 'https://tuls.test/engines/lo/worker.js' },
    caches: {
      open: async () => ({
        match: async (url: string) => saved[url]?.clone(),
      }),
    },
  } as Record<string, unknown>
  new Function('self', prelude)(scope)
  return { fetch: scope.fetch as (url: string) => Promise<Response> }
}

const bytes = new Uint8Array(1000).map((_, i) => i % 251)
const body = (data: Uint8Array) => new Uint8Array(data).buffer

describe('the fetch wrapper inside the engine', () => {
  it('unpacks gzipped engine files', async () => {
    const { fetch } = workerFetch(
      async () => new Response(body(gzipSync(bytes))),
    )
    const response = await fetch('/engines/lo/soffice.wasm.gz')
    expect(response.headers.get('Content-Type')).toBe('application/wasm')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('passes files through if the host already unpacked them', async () => {
    const { fetch } = workerFetch(async () => new Response(body(bytes)))
    const response = await fetch('/engines/lo/soffice.data.gz')
    expect(response.headers.get('Content-Type')).toBe(
      'application/octet-stream',
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('reads saved files from the cache, without the network', async () => {
    const network = vi.fn(async () => new Response('', { status: 500 }))
    const { fetch } = workerFetch(network, {
      'https://tuls.test/engines/lo/soffice.data.gz': new Response(
        body(gzipSync(bytes)),
      ),
    })
    const response = await fetch('/engines/lo/soffice.data.gz')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(network).not.toHaveBeenCalled()
  })

  it('leaves other requests, and failed ones, alone', async () => {
    const { fetch } = workerFetch(async (url) =>
      url.endsWith('.gz')
        ? new Response('gone', { status: 404 })
        : new Response('script'),
    )
    expect(await (await fetch('/engines/lo/soffice.js')).text()).toBe('script')
    expect((await fetch('/engines/lo/soffice.wasm.gz')).status).toBe(404)
  })
})
