import type { Plugin } from 'vite'

// qpdf.js and libheif.js (Emscripten's output) require Node's fs, path and
// crypto, in code they only run under Node. In the browser they're never
// used, so they become empty modules here, instead of Vite warning on every
// build that it left them out.

const STUB = '\0tuls:node-stub'
const NODE_ONLY = new Set(['fs', 'path', 'crypto'])

export function qpdf(): Plugin {
  return {
    name: 'tuls:qpdf',
    enforce: 'pre',
    resolveId(id, importer) {
      if (
        NODE_ONLY.has(id) &&
        (importer?.includes('/@neslinesli93/qpdf-wasm/') ||
          importer?.includes('/libheif-js/'))
      ) {
        return STUB
      }
    },
    load(id) {
      if (id === STUB) return 'export default {}'
    },
  }
}
