import { readFileSync } from 'node:fs'
import type { Connect, Plugin } from 'vite'

// The live site's headers (privacy policy, cross-origin isolation, caching)
// live in vercel.json, each rule for the addresses its `source` matches.
// This sends the same headers from `vite preview`, so the browser tests check
// what visitors get, and from the dev server too, apart from the privacy
// policy, which would block the code React's dev tools add to the page.
//
// An isolated page may only start workers whose scripts are sent with COEP.
// Built ones are in /assets/ and /engines/, which vercel.json covers, but
// the dev server serves them from all over (/src/, /node_modules/), so there
// every worker script gets it.

export type HeaderRule = {
  source: string
  headers: { key: string; value: string }[]
}

export function readRules(): HeaderRule[] {
  const vercel = JSON.parse(
    readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
  ) as { headers: HeaderRule[] }
  return vercel.headers
}

/**
 * Whether a vercel.json `source` matches an address. Tuls's sources are
 * plain regular expressions (e.g. "/assets/(.*)", "/((?!engines/).*)"),
 * which Vercel's path patterns accept as they are.
 */
export function matches(source: string, path: string) {
  return new RegExp(`^${source}$`).test(path)
}

/** The headers an address gets, from every rule that matches it. */
export function headersFor(rules: HeaderRule[], url: string) {
  const path = url.split(/[?#]/)[0]
  const headers: Record<string, string> = {}
  for (const rule of rules) {
    if (!matches(rule.source, path)) continue
    for (const { key, value } of rule.headers) headers[key] = value
  }
  return headers
}

export function siteHeaders(): Plugin {
  const rules = readRules()
  const send =
    (withPolicy: boolean): Connect.NextHandleFunction =>
    (req, res, next) => {
      for (const [key, value] of Object.entries(
        headersFor(rules, req.url ?? '/'),
      )) {
        if (withPolicy || key !== 'Content-Security-Policy') {
          res.setHeader(key, value)
        }
      }
      next()
    }
  return {
    name: 'tuls:site-headers',
    configureServer(server) {
      server.middlewares.use(send(false))
      server.middlewares.use((req, res, next) => {
        if (req.headers['sec-fetch-dest'] === 'worker') {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(send(true))
    },
  }
}
