import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { engineFetch } from './fetch'

const FOLDER = {
  dir: '/engines/pymupdf-1.0.0/',
  cache: 'tuls-pymupdf-1.0.0',
  gzipped: ['pyodide.asm.wasm', 'numpy-2.whl'],
}
const BASE = 'https://tuls.test/assets/worker.js'
const WASM = new TextEncoder().encode('\0asm wasm bytes')

describe('the PDF to Word worker’s fetch', () => {
  it('fetches gzipped files by their served name and unpacks them', async () => {
    const network = vi.fn(async () => new Response(gzipSync(WASM)))
    const fetch = engineFetch(network, FOLDER, BASE)
    const response = await fetch('/engines/pymupdf-1.0.0/pyodide.asm.wasm')
    expect(network).toHaveBeenCalledWith(
      'https://tuls.test/engines/pymupdf-1.0.0/pyodide.asm.wasm.gz',
      {},
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WASM)
    // WebAssembly.instantiateStreaming needs the right type.
    expect(response.headers.get('Content-Type')).toBe('application/wasm')
  })

  it('passes gzipped files through if the host unpacked them already', async () => {
    const fetch = engineFetch(async () => new Response(WASM), FOLDER, BASE)
    const response = await fetch('/engines/pymupdf-1.0.0/pyodide.asm.wasm')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(WASM)
  })

  it('fetches other engine files as they are, without an integrity check', async () => {
    const network = vi.fn(async () => new Response('{}'))
    const fetch = engineFetch(network, FOLDER, BASE)
    const response = await fetch('/engines/pymupdf-1.0.0/pyodide-lock.json', {
      integrity: 'sha256-x',
    })
    expect(network).toHaveBeenCalledWith(
      'https://tuls.test/engines/pymupdf-1.0.0/pyodide-lock.json',
      {},
    )
    expect(await response.text()).toBe('{}')
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('reads saved files from the cache, without the network', async () => {
    const network = vi.fn()
    const match = vi.fn(async () => new Response(gzipSync(WASM)))
    vi.stubGlobal('caches', { open: async () => ({ match }) })
    try {
      const fetch = engineFetch(network, FOLDER, BASE)
      const response = await fetch('/engines/pymupdf-1.0.0/numpy-2.whl')
      expect(match).toHaveBeenCalledWith(
        'https://tuls.test/engines/pymupdf-1.0.0/numpy-2.whl.gz',
      )
      expect(network).not.toHaveBeenCalled()
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(WASM)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('leaves other requests, and failed ones, alone', async () => {
    const other = new Response('page')
    const missing = new Response('', { status: 404 })
    const fetch = engineFetch(
      async (input) => (String(input).includes('engines') ? missing : other),
      FOLDER,
      BASE,
    )
    expect(await fetch('/index.html')).toBe(other)
    expect(await fetch('/engines/pymupdf-1.0.0/gone.whl')).toBe(missing)
  })
})
