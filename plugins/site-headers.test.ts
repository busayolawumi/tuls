import { describe, expect, it } from 'vitest'
import { tools } from '../src/tools/registry.ts'
import { headersFor, matches, readRules } from './site-headers.ts'

const rules = readRules()
const POLICY = 'Content-Security-Policy'
const ENGINE = '/engines/libreoffice-2.7.2/soffice.0123456789.js'
// PDF to Word's engine, which works with the page's own policy.
const PYMUPDF = '/engines/pymupdf-0.11.16/pyodide.asm.js'
const PAGES = ['/', '/video-to-gif', '/word-to-pdf', '/no-such-page', '/404']
const FILES = [
  '/assets/index-abc.js',
  '/licences.txt',
  '/pdfjs-6.4.299/cmaps/x',
  PYMUPDF,
]

describe('vercel.json headers', () => {
  it('matches addresses the way its patterns are written', () => {
    const pages = '/((?!engines/libreoffice-).*)'
    expect(matches(pages, '/')).toBe(true)
    expect(matches(pages, '/word-to-pdf')).toBe(true)
    expect(matches(pages, PYMUPDF)).toBe(true)
    expect(matches(pages, ENGINE)).toBe(false)
    expect(matches('/(word-to-pdf)', '/word-to-pdf')).toBe(true)
    expect(matches('/(word-to-pdf)', '/word-to-pdf-old')).toBe(false)
    expect(headersFor(rules, '/word-to-pdf?x=1')).toEqual(
      headersFor(rules, '/word-to-pdf'),
    )
  })

  it('gives every page and file the strict privacy policy', () => {
    for (const path of [...PAGES, ...FILES]) {
      const policy = headersFor(rules, path)[POLICY]
      expect(policy, path).toContain("connect-src 'self' blob:")
      expect(policy, path).not.toContain("'unsafe-eval'")
    }
  })

  it("gives LibreOffice the same policy, with only 'unsafe-eval' added", () => {
    // LibreOffice's glue code builds functions from strings. The engine's
    // workers take their policy from their own scripts, so pages stay strict.
    // No other engine needs it.
    const page = headersFor(rules, '/')[POLICY]
    expect(headersFor(rules, ENGINE)[POLICY]).toBe(
      page.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
    )
  })

  it('never gives an address the same header from two rules', () => {
    for (const path of [...PAGES, ...FILES, ENGINE, PYMUPDF]) {
      const keys = rules
        .filter((rule) => matches(rule.source, path))
        .flatMap((rule) => rule.headers.map((header) => header.key))
      expect(new Set(keys).size, path).toBe(keys.length)
    }
  })

  it('isolates exactly the tools that need it', () => {
    for (const tool of tools) {
      const headers = headersFor(rules, `/${tool.id}`)
      if (tool.isolated) {
        expect(headers['Cross-Origin-Opener-Policy'], tool.id).toBe(
          'same-origin',
        )
        expect(headers['Cross-Origin-Embedder-Policy'], tool.id).toBe(
          'require-corp',
        )
      } else {
        expect(headers['Cross-Origin-Opener-Policy'], tool.id).toBeUndefined()
        expect(headers['Cross-Origin-Embedder-Policy'], tool.id).toBeUndefined()
      }
    }
    expect(headersFor(rules, '/')['Cross-Origin-Embedder-Policy']).toBe(
      undefined,
    )
  })

  it('lets isolated pages start workers from built files and engines', () => {
    // An isolated page may only start a worker whose script is sent with
    // COEP too (Chrome: ERR_BLOCKED_BY_RESPONSE). On other files, and on
    // pages that aren't isolated, the header changes nothing that Tuls uses.
    for (const path of ['/assets/worker-abc.js', ENGINE, PYMUPDF]) {
      expect(headersFor(rules, path)['Cross-Origin-Embedder-Policy']).toBe(
        'require-corp',
      )
    }
  })

  it('caches built files and engines for good, and pages not at all', () => {
    for (const path of [
      '/assets/index-abc.js',
      '/pdfjs-6.4.299/x',
      ENGINE,
      PYMUPDF,
    ]) {
      expect(headersFor(rules, path)['Cache-Control'], path).toContain(
        'immutable',
      )
    }
    for (const path of PAGES) {
      expect(headersFor(rules, path)['Cache-Control'], path).toBeUndefined()
    }
  })
})
