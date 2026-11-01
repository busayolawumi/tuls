import { AxeBuilder } from '@axe-core/playwright'
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { expect, test, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { makePng } from '../src/lib/images.testing.ts'

// Test PDFs are made on the spot: pages of text, or "scanned" pages that are
// only a picture. `details` gives the PDF a title, author and so on, none of
// which may reach the Word file.
async function makePdf(
  name: string,
  pages: ('text' | 'scan')[],
  { password, details }: { password?: string; details?: boolean } = {},
) {
  const doc = await PDFDocument.create()
  if (details) {
    doc.setTitle('Secret title')
    doc.setAuthor('Ada Example')
    doc.setSubject('Secret subject')
    doc.setKeywords(['secret-keyword'])
    doc.setCreator('Secret Creator App')
  }
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const picture = await doc.embedPng(await makePng(30, 40))
  for (const [i, kind] of pages.entries()) {
    const page = doc.addPage([595, 842])
    if (kind === 'scan') {
      page.drawImage(picture, { x: 0, y: 0, width: 595, height: 842 })
      continue
    }
    page.drawText(`Heading ${i + 1}`, { x: 72, y: 760, size: 18, font: bold })
    for (let line = 0; line < 8; line++) {
      page.drawText(`Paragraph ${line + 1} of page ${i + 1}, in plain words.`, {
        x: 72,
        y: 720 - line * 22,
        size: 11,
        font,
      })
    }
  }
  if (password) doc.encrypt({ userPassword: password, ownerPassword: password })
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  }
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

/** A Word file's parts, fetched by the page from its blob: address. */
async function docxOf(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(text)
  }, href)
  const parts = unzipSync(new Uint8Array(Buffer.from(base64, 'base64')))
  const xml = (name: string) => (parts[name] ? strFromU8(parts[name]) : '')
  const text = [...xml('word/document.xml').matchAll(/<w:t[^>]*>([^<]*)/g)]
    .map((m) => m[1])
    .join(' ')
  return { parts, xml, text }
}

test('checks PDFs first: scans are pointed out, and problems named', async ({
  page,
}) => {
  const engine: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/engines/')) engine.push(request.url())
  })
  await page.goto('/pdf-to-word')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('scan.pdf', ['scan']),
      await makePdf('mixed.pdf', ['text', 'scan', 'scan', 'text', 'scan']),
      await makePdf('locked.pdf', ['text'], { password: 'secret' }),
      await makePdf('long.pdf', Array(301).fill('text')),
    ])
  const list = page.getByRole('list', { name: 'The PDFs' })
  // pdf.js reads every page's text first, which takes a few seconds on a
  // busy machine.
  await expect(list).toBeVisible({ timeout: 30_000 })
  await expect(list.getByRole('listitem')).toHaveText([
    'scan.pdfIt’s scanned, so its page is a picture. In Word it will stay a picture, not text you can edit.',
    'mixed.pdfPages 2–3 and 5 are scanned, so they’ll be pictures in Word, not text you can edit.',
  ])
  await expect(page.getByRole('alert')).toContainText(
    'locked.pdf: This PDF has a password.',
  )
  await expect(page.getByRole('alert')).toContainText(
    'long.pdf: It has 301 pages. Each PDF can have up to 300.',
  )
  expect(await axeViolations(page)).toEqual([])

  // Nothing was converted, so the engine wasn't needed.
  await page.getByRole('button', { name: 'Choose other PDFs' }).click()
  // "Drop PDFs…", or "Choose PDFs…" on a phone.
  await expect(
    page.getByRole('button', { name: /^(Drop|Choose) PDFs/ }),
  ).toBeVisible()
  expect(engine).toEqual([])
})

test('a file that isn’t a PDF is turned down', async ({ page }) => {
  await page.goto('/pdf-to-word')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(page.getByRole('alert')).toContainText('That isn’t a PDF.')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/pdf-to-word')).text()
  expect(html).toContain('<title>PDF to Word · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/pdf-to-word" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/pdf-to-word')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'PDF to Word',
  )
  expect(await axeViolations(page)).toEqual([])
})

test(
  'converts PDFs to Word files, with nothing of theirs but the content',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    // It runs on its own after the other tests (the "engines" project in
    // playwright.config.ts), or in a config's "light" project.
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(300_000)
    const errors = watchErrors(page)
    const elsewhere: string[] = []
    const starts: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (
        ![baseURL!, 'blob:', 'data:'].some((start) => url.startsWith(start))
      ) {
        elsewhere.push(url)
      }
      if (url.endsWith('/pyodide.js')) starts.push(url)
    })
    const warnings: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'warning') warnings.push(message.text())
    })

    await page.goto('/pdf-to-word')
    await page
      .locator('input[type=file]')
      .setInputFiles([
        await makePdf('report.pdf', ['text', 'text'], { details: true }),
        await makePdf('scan.pdf', ['scan']),
      ])
    await page.getByRole('button', { name: 'Convert anyway' }).click()
    await expect(page.getByRole('status')).toContainText(/Converting|converter/)

    const report = page.getByRole('link', { name: 'Download report.docx' })
    try {
      await expect(report).toBeVisible({ timeout: 240_000 })
    } catch (e) {
      await testInfo.attach('console warnings', { body: warnings.join('\n') })
      throw e
    }
    await expect(page.getByText(/^2 Word files · /)).toBeVisible()

    const word = await docxOf(page, (await report.getAttribute('href'))!)
    expect(word.text).toContain('Heading 1')
    expect(word.text).toContain('Paragraph 8 of page 2, in plain words.')
    // None of the PDF's details, and none of python-docx's template.
    const all = Object.keys(word.parts)
      .filter((name) => /\.(xml|rels)$/.test(name))
      .map(word.xml)
      .join('')
    for (const detail of [
      'Secret',
      'secret-keyword',
      'Ada Example',
      'python-docx',
      'Macintosh',
      '2013-12-23',
    ]) {
      expect(all, detail).not.toContain(detail)
    }
    expect(word.xml('docProps/app.xml')).toContain(
      '<Application>Tuls</Application>',
    )
    expect(word.parts['docProps/thumbnail.jpeg']).toBeUndefined()
    expect(word.xml('_rels/.rels')).not.toContain('thumbnail')

    // The scan stays a picture.
    const scan = await docxOf(
      page,
      (await page
        .getByRole('link', { name: 'Download scan.docx' })
        .getAttribute('href'))!,
    )
    expect(scan.text.trim()).toBe('')
    expect(
      Object.keys(scan.parts).some((name) => name.startsWith('word/media/')),
    ).toBe(true)
    expect(await axeViolations(page)).toEqual([])

    // Another, with no scans: straight to converting, with the engine kept.
    await page.getByRole('button', { name: 'Convert more PDFs' }).click()
    await page
      .locator('input[type=file]')
      .setInputFiles(await makePdf('notes.pdf', ['text']))
    await expect(
      page.getByRole('link', { name: 'Download Word file' }),
    ).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('textbox', { name: 'File name' })).toHaveValue(
      'notes',
    )
    await expect(page.getByText(/^From a 1-page PDF · /)).toBeVisible()

    expect(starts).toHaveLength(1)
    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)
