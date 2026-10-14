import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '../src/site.ts'
import { tools } from '../src/tools/registry.ts'
import type { ToolManifest } from '../src/tools/types.ts'

// Tuls is a single-page app, but link previews (WhatsApp, Slack, X) and
// search engines read a page's <head> before any JavaScript runs. So the
// build writes one HTML file per tool, each with its own title, description
// and preview tags, between the page:start and page:end markers in index.html.

export type PageMeta = { path: string; title: string; description: string }

export const homePage: PageMeta = {
  path: '/',
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
}

export function toolPage(tool: ToolManifest): PageMeta {
  return {
    path: `/${tool.id}`,
    title: `${tool.name} · ${SITE_NAME}`,
    description: tool.description,
  }
}

const escape = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export function headTags({ path, title, description }: PageMeta) {
  const url = escape(SITE_URL + path)
  return [
    `<title>${escape(title)}</title>`,
    `<meta name="description" content="${escape(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escape(SITE_NAME)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escape(title)}" />`,
    `<meta property="og:description" content="${escape(description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ].join('\n    ')
}

const START = '<!-- page:start -->'
const END = '<!-- page:end -->'

/** Replaces everything between the page markers with this page's tags. */
export function withHead(html: string, page: PageMeta) {
  const start = html.indexOf(START)
  const end = html.indexOf(END)
  if (start < 0 || end < start) {
    throw new Error(
      'index.html needs <!-- page:start --> and <!-- page:end -->',
    )
  }
  return `${html.slice(0, start + START.length)}\n    ${headTags(page)}\n    ${html.slice(end)}`
}

export function toolPages(): Plugin {
  return {
    name: 'tuls:tool-pages',
    // The home page's tags, in development and in the build.
    transformIndexHtml: (html) => withHead(html, homePage),
    // After the build, a copy of the home page for each tool, with its tags:
    // video-to-gif.html, served at /video-to-gif (vercel.json's cleanUrls, and
    // `vite preview` looks for .html files too).
    async writeBundle({ dir }) {
      if (!dir) return
      const index = await readFile(join(dir, 'index.html'), 'utf8')
      for (const tool of tools) {
        await writeFile(
          join(dir, `${tool.id}.html`),
          withHead(index, toolPage(tool)),
        )
      }
    },
  }
}
