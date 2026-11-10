// Makes the site icon and the link-preview image from one drawing of the
// toolbox, in the style of Gify, Trim and x-n-o:
//   public/favicon.svg         near-black on light tabs, white on dark ones
//   public/favicon-32.png      for browsers without SVG icons: a dark tile
//   public/apple-touch-icon.png  the phone home-screen icon: a dark square
//   public/og-image.png        the link-preview card (1200×630)
// The PNGs are drawn by Chrome, with the real Geist font.
// Run it with `npm run images` after changing the icon, headline or tagline.
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { HEADLINE, SITE_URL, TAGLINE } from '../src/site.ts'

const ORANGE = '#ea580c' // orange-600, the accent
const INK_LIGHT = '#18181b' // zinc-900
const INK_DARK = '#fafafa' // zinc-50
const TILE = '#18181b' // zinc-900, as in Trim's and x-n-o's icons
const CARD = '#09090b' // zinc-950, the preview card's background
const MUTED = '#a1a1aa' // zinc-400

const out = (name: string) =>
  fileURLToPath(new URL(`../public/${name}`, import.meta.url))

/**
 * The toolbox on a 32×32 grid: an orange handle and catch, and a body in
 * `ink`. With `ink` left out, the body takes the `ink` class instead, so a
 * stylesheet can colour it.
 */
function toolbox(ink?: string) {
  const body = ink ? `stroke="${ink}"` : 'class="ink"'
  return `<g fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 -0.5)">
    <path d="M11.5 12V8.5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2V12" stroke="${ORANGE}" />
    <rect x="4" y="12" width="24" height="15" rx="3" ${body} />
    <path d="M4 18.5h24" ${body} />
    <path d="M16 17v3.5" stroke="${ORANGE}" />
  </g>`
}

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- A toolbox: an orange handle and catch, and a body that's near-black on
       light tab bars and white on dark ones. Made by scripts/make-images.ts. -->
  <style>
    .ink { stroke: ${INK_LIGHT}; }
    @media (prefers-color-scheme: dark) {
      .ink { stroke: ${INK_DARK}; }
    }
  </style>
  ${toolbox()}
</svg>
`

// White toolbox on a dark rounded tile, so it shows on light and dark tabs.
const favicon32 = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${TILE}" />
  <g transform="translate(3.5 3.5) scale(0.78)">${toolbox(INK_DARK)}</g>
</svg>`

// iPhones round the corners themselves, so this is a full square. The
// toolbox fills 68% of it, as Gify's arrows do.
const appleIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" fill="${TILE}" />
  <g transform="translate(28.8 28.8) scale(3.825)">${toolbox(INK_DARK)}</g>
</svg>`

async function fontFace(family: string, file: string) {
  const data = await readFile(
    new URL(`../node_modules/${file}`, import.meta.url),
  )
  return `@font-face { font-family: '${family}'; font-weight: 100 900; src: url(data:font/woff2;base64,${data.toString('base64')}) format('woff2'); }`
}

// Laid out like Trim's card: icon and wordmark, headline, tagline, address.
async function ogImageHtml() {
  const fonts = [
    await fontFace(
      'Geist',
      '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
    ),
  ].join('\n')
  const host = new URL(SITE_URL).host
  return `<!doctype html><html><head><style>
    ${fonts}
    body { margin: 0; width: 1200px; height: 630px; background: ${CARD}; color: ${INK_DARK}; font-family: 'Geist', sans-serif; }
    .card { box-sizing: border-box; height: 100%; padding: 88px 80px 80px; display: flex; flex-direction: column; }
    .brand { display: flex; align-items: center; gap: 16px; font-size: 48px; font-weight: 450; letter-spacing: -0.03em; }
    .brand svg { width: 52px; height: 52px; }
    .dot { color: ${ORANGE}; }
    h1 { margin: 88px 0 0; font-size: 88px; font-weight: 450; letter-spacing: -0.035em; line-height: 1; }
    p { margin: 26px 0 0; font-size: 32px; line-height: 1.3; color: ${MUTED}; letter-spacing: -0.01em; text-wrap: pretty; }
    .address { margin-top: auto; align-self: flex-start; font-size: 30px; padding: 16px 28px; border-radius: 14px; border: 1.5px solid #27272a; background: #18181b; }
  </style></head><body><div class="card">
    <div class="brand"><svg viewBox="0 0 32 32">${toolbox(INK_DARK)}</svg><span>Tuls<span class="dot">.</span></span></div>
    <h1>${HEADLINE}</h1>
    <p>${TAGLINE}</p>
    <div class="address">${host}</div>
  </div></body></html>`
}

const browser = await chromium
  .launch({ channel: 'chrome' })
  .catch(() => chromium.launch())
try {
  const page = await browser.newPage()

  async function render(
    html: string,
    width: number,
    height: number,
    name: string,
  ) {
    await page.setViewportSize({ width, height })
    await page.setContent(html)
    // A string, because this script is type-checked without the browser's types.
    await page.evaluate('document.fonts.ready')
    await page.screenshot({ path: out(name), omitBackground: true })
    console.log(`wrote public/${name}`)
  }

  const bare = (svg: string) =>
    `<!doctype html><html><body style="margin:0">${svg}</body></html>`

  await writeFile(out('favicon.svg'), faviconSvg)
  console.log('wrote public/favicon.svg')
  await render(bare(favicon32), 32, 32, 'favicon-32.png')
  await render(bare(appleIcon), 180, 180, 'apple-touch-icon.png')
  await render(await ogImageHtml(), 1200, 630, 'og-image.png')
} finally {
  await browser.close()
}
