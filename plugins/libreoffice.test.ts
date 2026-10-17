import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { unzipSync } from 'fflate'
import {
  fontConfig,
  freeFontPack,
  patchSoffice,
  patchWorker,
  replaceOnce,
} from './libreoffice.ts'
import { FREE_FONTS, freeFontFiles } from './libreoffice-fonts/free.ts'
import {
  SUBSTITUTES,
  substituteAliases,
} from './libreoffice-fonts/substitutes.ts'

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

  it('opens documents in the visitor’s language, when the page sends one', () => {
    const patched = patchWorker(read('dist/browser.worker.global.js'))
    expect(
      patched.includes(
        'let m=[M(t,o),l.language?"Language="+l.language:""].filter(Boolean).join(",");',
      ),
    ).toBe(true)
  })

  it('keeps LibreOffice’s font aliases and adds Tuls’s', async () => {
    const config = await fontConfig()
    // LibreOffice's own, e.g. Arial Narrow to Liberation Sans Narrow.
    expect(config).toContain('<family>Arial Narrow</family>')
    for (const { family } of [...SUBSTITUTES, ...FREE_FONTS]) {
      expect(config).toContain(`<family>${family}</family>`)
    }
    expect(config.trimEnd().endsWith('</fontconfig>')).toBe(true)
    expect(config.match(/<\/fontconfig>/g)).toHaveLength(1)
  })

  it('substitutes each font with its stand-in, then Arial’s twin', () => {
    expect(
      substituteAliases([{ family: 'Open Sans', use: 'Noto Sans' }]),
    ).toContain(
      '<alias binding="same"><family>Open Sans</family><accept><family>Noto Sans</family><family>Liberation Sans</family></accept></alias>',
    )
    // Not twice, when the stand-in is Liberation Sans itself.
    expect(
      substituteAliases([{ family: 'Roboto', use: 'Liberation Sans' }]),
    ).toContain('<accept><family>Liberation Sans</family></accept>')
    expect(substituteAliases([{ family: 'A&B', use: 'Noto Sans' }])).toContain(
      '<family>A&amp;B</family>',
    )
  })

  it('gives Tuls’s own fonts Arial’s twin for what they lack', () => {
    expect(substituteAliases([], ['Open Sans'])).toContain(
      '<alias binding="same"><family>Open Sans</family><accept><family>Liberation Sans</family></accept></alias>',
    )
  })

  it('gives weights named as fonts their family’s regular or bold', () => {
    const rules = substituteAliases(
      [
        { family: 'Aptos', use: 'Carlito', weights: true },
        { family: 'Calibri', use: 'Carlito' },
      ],
      ['Montserrat'],
    )
    expect(rules).toContain(
      '<match target="pattern"><test name="family"><string>Montserrat SemiBold</string></test><edit name="family" mode="assign" binding="same"><string>Montserrat</string></edit><edit name="weight" mode="assign"><const>bold</const></edit></match>',
    )
    expect(rules).toContain(
      '<match target="pattern"><test name="family"><string>Montserrat Light</string></test><edit name="family" mode="assign" binding="same"><string>Montserrat</string></edit></match>',
    )
    expect(rules).toContain('<string>Aptos Black</string>')
    // Only for families that come in weights.
    expect(rules).not.toContain('Calibri SemiBold')
    // Before the aliases, which then see the family's own name.
    expect(rules.indexOf('Aptos ExtraBold')).toBeLessThan(
      rules.indexOf('<alias'),
    )
  })

  it('has each of Tuls’s fonts, named so LibreOffice finds them', () => {
    for (const font of FREE_FONTS) {
      const files = freeFontFiles(font)
      expect(files).toHaveLength(font.italics === false ? 2 : 4)
      for (const path of files) {
        const ttf = readFileSync(require.resolve(path))
        // TrueType, with the family's name in its name table (UTF-16).
        expect(ttf.readUInt32BE(0), path).toBe(0x00010000)
        expect(
          ttf.includes(Buffer.from(font.family, 'utf16le').swap16()),
          path,
        ).toBe(true)
      }
      expect(
        SUBSTITUTES.some((s) => s.family === font.family),
        font.family,
      ).toBe(false)
    }
  })

  it('packs them in one ZIP that only changes when they do', () => {
    const pack = freeFontPack()
    expect(freeFontPack().equals(pack)).toBe(true)
    const names = Object.keys(unzipSync(new Uint8Array(pack)))
    expect(names).toHaveLength(
      FREE_FONTS.flatMap((font) => freeFontFiles(font)).length,
    )
    expect(names).toContain('Roboto_700Bold.ttf')
    // About 4.7 MB: a little more than this is fine, a lot more isn't.
    expect(pack.length).toBeLessThan(5_500_000)
  })

  it('only names stand-ins the engine or Tuls has', async () => {
    const sofficeJs = read('wasm/soffice.js')
    const files = new Set(
      [...sofficeJs.matchAll(/filename:"[^"]*\/([^"/]+)\.(?:ttf|otf)"/g)].map(
        (m) => m[1].replace(/[-_].*$/, ''),
      ),
    )
    const fileOf: Record<string, string> = {
      'Liberation Sans': 'LiberationSans',
      'Liberation Serif': 'LiberationSerif',
      'Liberation Mono': 'LiberationMono',
      'Liberation Sans Narrow': 'LiberationSansNarrow',
      Carlito: 'Carlito',
      Caladea: 'Caladea',
      'Noto Sans': 'NotoSans',
      'Noto Serif': 'NotoSerif',
      'DejaVu Sans': 'DejaVuSans',
      'DejaVu Sans Condensed': 'DejaVuSansCondensed',
      'DejaVu Serif Condensed': 'DejaVuSerifCondensed',
      'DejaVu Sans Mono': 'DejaVuSansMono',
      'Linux Biolinum G': 'LinBiolinum',
      Rubik: 'Rubik',
    }
    const free = new Set(FREE_FONTS.map((font) => font.family))
    for (const { use } of SUBSTITUTES.filter((s) => !free.has(s.use))) {
      expect(fileOf[use], use).toBeDefined()
      expect(files.has(fileOf[use]), use).toBe(true)
    }
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
