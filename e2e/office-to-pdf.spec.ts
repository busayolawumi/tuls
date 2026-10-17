import { PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib'
import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { makePptx, makeXlsx } from './office-files.ts'

// Excel to PDF, then PowerPoint to PDF with the engine still running, as a
// British visitor: what Office leaves to the computer's settings (the
// paper of a sheet that doesn't say, "short date" cells) follows theirs.
test.use({ locale: 'en-GB' })

/** A downloaded file's bytes, fetched by the page from its blob: address. */
async function bytesOf(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  return Buffer.from(base64, 'base64')
}

/** Everything a PDF says, its pages' sizes in points, and its fonts. */
async function readPdf(bytes: Uint8Array) {
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise
  let text = ''
  const sizes: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    sizes.push(`${Math.round(page.view[2])}×${Math.round(page.view[3])}`)
    text += (await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
  }
  await doc.loadingTask.destroy()
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
  const fonts = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFDict =>
        object instanceof PDFDict &&
        String(object.get(PDFName.of('Type'))) === '/Font',
    )
    .map((font) => String(font.get(PDFName.of('BaseFont'))))
  return { text, sizes, fonts, author: pdf.getAuthor(), title: pdf.getTitle() }
}

// The page's warnings, attached to a failed test's report. The engine says
// there when it replaced a stuck engine, which a busy machine can cause.
let warnings: string[] = []
test.beforeEach(({ page }) => {
  warnings = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
})
// Playwright wants the fixtures argument, even when none are used.
// oxlint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && warnings.length) {
    await testInfo.attach('console warnings', { body: warnings.join('\n') })
  }
})

async function convertedPdf(page: Page) {
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toBeVisible({ timeout: 180_000 })
  return readPdf(await bytesOf(page, (await download.getAttribute('href'))!))
}

test(
  'converts a spreadsheet, then a presentation with the engine still running',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    // It runs on its own after the other tests (the "engines" project in
    // playwright.config.ts), or in a config's "light" project.
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(300_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const elsewhere: string[] = []
    const engineStarts: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (
        ![baseURL!, 'blob:', 'data:'].some((start) => url.startsWith(start))
      ) {
        elsewhere.push(url)
      }
      if (/\/engines\/libreoffice-[^/]+\/worker\./.test(url)) {
        engineStarts.push(url)
      }
    })

    await page.goto('/excel-to-pdf')
    await page
      .locator('input[type=file]')
      .setInputFiles(makeXlsx('totals.xlsx'))
    const sheet = await convertedPdf(page)
    // One page: the hidden sheet isn't printed, as in Excel. A4, because the
    // sheet doesn't say and the visitor is British; and the date as their
    // Excel shows it.
    expect(sheet.sizes).toEqual(['595×842'])
    expect(sheet.text).toContain('04/03/2026')
    expect(sheet.text).toContain('1234.5')
    expect(sheet.text).not.toContain('HiddenSheetSecret')
    // Aptos Narrow, which isn't free, comes out in Carlito, its closest match.
    expect(sheet.fonts.some((font) => font.endsWith('+Carlito'))).toBe(true)
    expect(sheet.fonts.some((font) => font.includes('Noto'))).toBe(false)
    expect(sheet.author).toBeUndefined()
    expect(sheet.title).toBeUndefined()
    await expect(page.getByText(/^1 page · /)).toBeVisible()

    // To PowerPoint to PDF through the home page, without reloading: the page
    // is already isolated, so the engine is kept.
    await page.evaluate('window.stillHere = true')
    await page.getByRole('link', { name: 'Tuls' }).click()
    await page.getByRole('link', { name: /^PowerPoint to PDF/ }).click()
    await expect(page).toHaveURL(/\/powerpoint-to-pdf$/)
    expect(await page.evaluate('window.stillHere')).toBe(true)

    await page.locator('input[type=file]').setInputFiles(
      makePptx('review.pptx', [
        'First slide',
        'HiddenSlideSecret',
        { text: 'Roboto words', font: 'Roboto', bold: true },
        // A weight Windows lists as a font of its own.
        { text: 'Last slide', font: 'Montserrat SemiBold' },
      ]),
    )
    const deck = await convertedPdf(page)
    // The hidden slide isn't shown, as in PowerPoint. 16:9 slides.
    expect(deck.sizes).toEqual(['960×540', '960×540', '960×540'])
    expect(deck.text).toContain('First slide')
    expect(deck.text).toContain('Last slide')
    expect(deck.text).not.toContain('HiddenSlideSecret')
    // Free fonts in the very font, not a stand-in; SemiBold as the bold.
    expect(deck.fonts.some((font) => font.endsWith('+Roboto-Bold'))).toBe(true)
    expect(deck.fonts.some((font) => font.endsWith('+Montserrat-Bold'))).toBe(
      true,
    )
    expect(deck.fonts.some((font) => font.includes('DejaVu'))).toBe(false)
    expect(deck.author).toBeUndefined()

    // The engine started once, for both: moving between the tools kept it.
    // Only a stuck engine, replaced (and said so), adds another start.
    const restarts = warnings.filter((text) => text.includes('was restarted'))
    expect(engineStarts).toHaveLength(1 + restarts.length)
    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)
