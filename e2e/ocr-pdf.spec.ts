import { AxeBuilder } from '@axe-core/playwright'
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
import { expect, test, type Page } from '@playwright/test'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { makePng } from '../src/lib/images.testing.ts'

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

const LINES = [
  'Invoice number 4417',
  'Delivered to Lagos office',
  'Total due within thirty days',
]

/**
 * A "scanned" page: lines of text drawn by the browser into a PNG at about
 * 200 dpi, with no text in the PDF itself. `sideways` turns the picture a
 * quarter turn anticlockwise, as a page fed into a scanner the wrong way.
 */
async function scanPng(page: Page, sideways = false) {
  const base64 = (await page.evaluate(`(async () => {
    const lines = ${JSON.stringify(LINES)}
    const upright = new OffscreenCanvas(1650, 2340)
    const g = upright.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 1650, 2340)
    g.fillStyle = '#111'
    g.font = '64px serif'
    lines.forEach((line, i) => g.fillText(line, 160, 300 + i * 120))
    let canvas = upright
    if (${sideways}) {
      canvas = new OffscreenCanvas(2340, 1650)
      const s = canvas.getContext('2d')
      s.translate(0, 1650)
      s.rotate(-Math.PI / 2)
      s.drawImage(upright, 0, 0)
    }
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(text)
  })()`)) as string
  return Buffer.from(base64, 'base64')
}

type PageKind = 'text' | 'blank-scan' | Buffer

/** A PDF of typed pages, plain pictures, and given scans (PNGs). */
async function makePdf(
  name: string,
  pages: PageKind[],
  { password, sideways = [] }: { password?: string; sideways?: number[] } = {},
) {
  const doc = await PDFDocument.create()
  doc.setAuthor('Ada Example')
  doc.setTitle('Secret title')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const blank = await doc.embedPng(await makePng(30, 40))
  for (const [i, kind] of pages.entries()) {
    const wide = sideways.includes(i + 1)
    const page = doc.addPage(wide ? [842, 595] : [595, 842])
    if (kind === 'text') {
      page.drawText(`Typed page ${i + 1}`, { x: 72, y: 760, size: 18, font })
    } else {
      const picture = kind === 'blank-scan' ? blank : await doc.embedPng(kind)
      page.drawImage(picture, {
        x: 0,
        y: 0,
        width: page.getWidth(),
        height: page.getHeight(),
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

/** A file the page made, by its link's address. */
async function fetchFile(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    return btoa(text)
  }, href)
  return Buffer.from(base64, 'base64')
}

/** Each page's text and rotation, as a reader finds them. */
async function readBack(bytes: Buffer) {
  const doc = await getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
  }).promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const text = (await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push({ text, rotate: page.rotate })
  }
  const { info } = await doc.getMetadata()
  return { pages, info: info as Record<string, unknown> }
}

test('checks PDFs first, and remembers the language', async ({ page }) => {
  const engine: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/engines/')) engine.push(request.url())
  })
  await page.goto('/ocr-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('scan.pdf', ['blank-scan']),
      await makePdf('mixed.pdf', ['text', 'blank-scan', 'blank-scan']),
      await makePdf('typed.pdf', ['text', 'text']),
      await makePdf('locked.pdf', ['blank-scan'], { password: 'secret' }),
    ])
  const list = page.getByRole('list', { name: 'The PDFs' })
  await expect(list).toBeVisible({ timeout: 30_000 })
  await expect(list.getByRole('listitem')).toHaveText([
    'scan.pdf1 page to read',
    'mixed.pdf2 of 3 pages to read',
  ])
  const alert = page.getByRole('alert')
  await expect(alert).toContainText(
    'typed.pdf: It already has text you can search and copy.',
  )
  await expect(alert).toContainText(
    'locked.pdf: It has a password. Take it off first with Unlock PDF.',
  )
  await expect(page.getByRole('link', { name: 'Unlock PDF' })).toBeVisible()

  const languages = page.getByRole('group', { name: 'Language of the text' })
  await expect(languages.getByRole('radio')).toHaveCount(8)
  await expect(languages.getByRole('radio', { name: 'English' })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Make 2 PDFs searchable' }),
  ).toBeVisible()
  await expect(
    page.getByText(/^The text reader for English is a [\d.]+ MB download/),
  ).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await languages.getByText('Yoruba').click()
  await expect(
    page.getByText(/^The text reader for Yoruba is a [\d.]+ MB download/),
  ).toBeVisible()
  await page.reload()
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('scan.pdf', ['blank-scan'])])
  await expect(
    page
      .getByRole('group', { name: 'Language of the text' })
      .getByRole('radio', { name: 'Yoruba' }),
  ).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Make searchable' }),
  ).toBeVisible()

  // Nothing was read, so the reader wasn't needed.
  expect(engine).toEqual([])
})

test('a file that isn’t a PDF is turned down', async ({ page }) => {
  await page.goto('/ocr-pdf')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(page.getByRole('alert')).toContainText('That isn’t a PDF.')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/ocr-pdf')).text()
  expect(html).toContain('<title>OCR PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/ocr-pdf" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/ocr-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('OCR PDF')
  expect(await axeViolations(page)).toEqual([])
})

test(
  'reads scanned pages, turns a sideways one upright, and sends nothing elsewhere',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(240_000)
    const errors = watchErrors(page)
    const elsewhere: string[] = []
    const fetched: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (
        ![baseURL!, 'blob:', 'data:'].some((start) => url.startsWith(start))
      ) {
        elsewhere.push(url)
      }
      fetched.push(url)
    })

    await page.goto('/ocr-pdf')
    const upright = await scanPng(page)
    const sideways = await scanPng(page, true)
    await page.locator('input[type=file]').setInputFiles([
      await makePdf('letter.pdf', ['text', upright, sideways, 'blank-scan'], {
        sideways: [3],
      }),
    ])
    await page
      .getByRole('group', { name: 'Language of the text' })
      .getByText('English')
      .click()
    await page.getByRole('button', { name: 'Make searchable' }).click()

    const download = page.getByRole('link', { name: 'Download PDF' })
    await expect(download).toBeVisible({ timeout: 180_000 })
    await expect(download).toHaveAttribute('download', 'letter-searchable.pdf')
    const notes = page.getByRole('list', { name: 'What was read' })
    await expect(notes.getByRole('listitem')).toHaveText([
      'Text added to pages 2–3.',
      'One page had text already.',
      'Page 3 was sideways or upside down, so it’s been turned the right way up.',
      'No text could be read on page 4: it may be a picture, or too faint to read.',
    ])

    const { pages, info } = await readBack(
      await fetchFile(page, (await download.getAttribute('href'))!),
    )
    expect(pages[0]).toEqual({ text: 'Typed page 1', rotate: 0 })
    for (const n of [1, 2]) {
      for (const line of LINES)
        expect(pages[n].text, `page ${n + 1}`).toContain(line)
    }
    expect(pages[1].rotate).toBe(0)
    expect(pages[2].rotate).toBe(90)
    expect(pages[3]).toEqual({ text: '', rotate: 0 })
    expect(info.Author).toBeUndefined()
    expect(info.Title).toBeUndefined()

    expect(await axeViolations(page)).toEqual([])

    // Again, with the readers kept: nothing more of the engine is fetched.
    const engine = () =>
      fetched.filter((url) => url.includes('/engines/tesseract-')).length
    const before = engine()
    expect(before).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Choose another language' }).click()
    await page.getByRole('button', { name: 'Make searchable' }).click()
    await expect(download).toBeVisible({ timeout: 120_000 })
    expect(engine()).toBe(before)

    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)

test(
  'Cancel stops reading at once',
  { tag: '@engine' },
  async ({ page }, testInfo) => {
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(180_000)
    const errors = watchErrors(page)
    await page.goto('/ocr-pdf')
    const upright = await scanPng(page)
    await page
      .locator('input[type=file]')
      .setInputFiles([await makePdf('long.pdf', Array(12).fill(upright))])
    await page.getByRole('button', { name: 'Make searchable' }).click()
    await expect(page.getByText(/^Reading page \d+ of 12…$/)).toBeVisible({
      timeout: 120_000,
    })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(
      page.getByRole('button', { name: 'Make searchable' }),
    ).toBeVisible()
    await expect(page.getByText('Stopped. Nothing was read.')).toBeAttached()

    // And it starts again afresh.
    await page.getByRole('button', { name: 'Make searchable' }).click()
    await expect(page.getByText(/^Reading page \d+ of 12…$/)).toBeVisible({
      timeout: 120_000,
    })
    await page.getByRole('button', { name: 'Cancel' }).click()
    expect(errors).toEqual([])
  },
)
