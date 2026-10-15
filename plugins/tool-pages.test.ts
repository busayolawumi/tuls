import { describe, expect, it } from 'vitest'
import {
  headTags,
  homePage,
  notFoundPage,
  toolPage,
  withHead,
} from './tool-pages.ts'

const template = `<head>
    <!-- page:start -->
    <title>Tuls</title>
    <!-- page:end -->
  </head>`

describe('toolPage', () => {
  it('puts the tool first in the title and uses its own address', () => {
    const page = toolPage({
      id: 'video-to-gif',
      name: 'Video to GIF',
      description: 'Makes GIFs.',
      category: 'Video',
      accepts: ['mp4'],
    })
    expect(page).toEqual({
      path: '/video-to-gif',
      title: 'Video to GIF · Tuls',
      description: 'Makes GIFs.',
    })
  })
})

describe('headTags', () => {
  it('gives a page its title, address and link preview', () => {
    const tags = headTags({
      path: '/video-to-gif',
      title: 'Video to GIF · Tuls',
      description: 'Makes GIFs.',
    })
    expect(tags).toContain('<title>Video to GIF · Tuls</title>')
    expect(tags).toContain(
      '<link rel="canonical" href="https://tuls.busayolawumi.dev/video-to-gif" />',
    )
    expect(tags).toContain(
      '<meta property="og:url" content="https://tuls.busayolawumi.dev/video-to-gif" />',
    )
    expect(tags).toContain(
      '<meta property="og:image" content="https://tuls.busayolawumi.dev/og-image.png" />',
    )
    expect(tags).toContain(
      '<meta name="twitter:card" content="summary_large_image" />',
    )
  })

  it('escapes text, so a title or description can’t break the page', () => {
    const tags = headTags({
      path: '/x',
      title: 'A & B <C>',
      description: 'Say "hi"',
    })
    expect(tags).toContain('<title>A &amp; B &lt;C&gt;</title>')
    expect(tags).toContain('content="Say &quot;hi&quot;"')
    expect(tags).not.toContain('<C>')
  })

  it('keeps the not-found page out of search results and previews', () => {
    const tags = headTags(notFoundPage)
    expect(tags).toContain('<meta name="robots" content="noindex" />')
    expect(tags).not.toContain('og:')
    expect(tags).not.toContain('canonical')
  })
})

describe('withHead', () => {
  it('replaces only what’s between the markers', () => {
    const html = withHead(template, homePage)
    expect(html.startsWith('<head>\n    <!-- page:start -->')).toBe(true)
    expect(html).toContain('<!-- page:end -->\n  </head>')
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html).toContain('og:title')
  })

  it('says so when index.html is missing the markers', () => {
    expect(() => withHead('<head></head>', homePage)).toThrow('page:start')
  })
})
