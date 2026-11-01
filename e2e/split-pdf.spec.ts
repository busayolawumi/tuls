import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { unzipSync } from 'fflate'

// Test PDFs are made on the spot: blank pages told apart by their widths.
async function makePdf(name: string, widths: number[], password?: string) {
  const doc = await PDFDocument.create()
  for (const width of widths) doc.addPage([width, 500])
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

async function open(page: Page, widths = [100, 200, 300, 400, 500]) {
  await page.goto('/split-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('report.pdf', widths))
  const grid = page.getByRole('list', { name: 'Pages' })
  await expect(grid.locator('img')).toHaveCount(widths.length)
  return grid
}

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

const widthsOf = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => p.getSize().width)

test('splits where chosen, as PDFs and a ZIP, without sending anything elsewhere', async ({
  page,
  baseURL,
}) => {
  const errors = watchErrors(page)
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    const local = [baseURL!, 'blob:', 'data:'].some((start) =>
      url.startsWith(start),
    )
    if (!local) elsewhere.push(url)
  })
  await open(page)
  const split = page.getByRole('button', { name: 'Split PDF' })
  await expect(page.getByText('Choose where to split.')).toBeVisible()
  await expect(split).toBeDisabled()

  const scissors = page.getByRole('button', { name: 'Split after page 2' })
  await scissors.click()
  await expect(scissors).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('2 parts', { exact: true })).toBeVisible()
  // The last page has no scissors: there's nothing after it.
  await expect(
    page.getByRole('button', { name: 'Split after page 5' }),
  ).toHaveCount(0)

  await split.click()
  const parts = page.getByRole('list', { name: 'The new PDFs' })
  await expect(parts.getByRole('listitem')).toHaveCount(2)
  await expect(parts).toContainText('report-pages-1-2.pdf')
  await expect(parts).toContainText('Pages 3–5')

  const first = page.getByRole('link', {
    name: 'Download report-pages-1-2.pdf',
  })
  const second = page.getByRole('link', {
    name: 'Download report-pages-3-5.pdf',
  })
  expect(
    await widthsOf(await bytesOf(page, (await first.getAttribute('href'))!)),
  ).toEqual([100, 200])
  expect(
    await widthsOf(await bytesOf(page, (await second.getAttribute('href'))!)),
  ).toEqual([300, 400, 500])

  // A new name for them all, then the ZIP, which is made on the click.
  await page.getByRole('textbox', { name: 'File names' }).fill('Statements')
  await expect(
    page.getByRole('link', { name: 'Download Statements-pages-1-2.pdf' }),
  ).toHaveAttribute('download', 'Statements-pages-1-2.pdf')
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (ZIP)' }).click(),
  ])
  expect(zip.suggestedFilename()).toBe('Statements.zip')
  const files = unzipSync(await readFile(await zip.path()))
  expect(Object.keys(files)).toEqual([
    'Statements-pages-1-2.pdf',
    'Statements-pages-3-5.pdf',
  ])
  expect(await widthsOf(files['Statements-pages-3-5.pdf'])).toEqual([
    300, 400, 500,
  ])

  // Back to the pages, with the split still there.
  await page.getByRole('button', { name: 'Change the splits' }).click()
  await expect(
    page.getByRole('button', { name: 'Split after page 2' }),
  ).toHaveAttribute('aria-pressed', 'true')

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('every page, every few pages, and clearing', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Every page' }).click()
  await expect(page.getByText('5 parts', { exact: true })).toBeVisible()

  await page.getByRole('spinbutton', { name: 'Every pages' }).fill('2')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByText('3 parts', { exact: true })).toBeVisible()
  for (const [number, pressed] of [
    [1, 'false'],
    [2, 'true'],
    [3, 'false'],
    [4, 'true'],
  ] as const) {
    await expect(
      page.getByRole('button', { name: `Split after page ${number}` }),
    ).toHaveAttribute('aria-pressed', pressed)
  }

  await page.getByRole('button', { name: 'Clear splits' }).click()
  await expect(page.getByText('Choose where to split.')).toBeVisible()
})

test('a one-page PDF has nothing to split', async ({ page }) => {
  await page.goto('/split-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('one.pdf', [300]))
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has just one page, so there’s nothing to split.',
  )
})

test('a password-protected PDF gets a plain message', async ({ page }) => {
  await page.goto('/split-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('locked.pdf', [300, 300], 'secret'))
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has a password. Take it off first with Unlock PDF, then try again.',
  )
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/split-pdf')).text()
  expect(html).toContain('<title>Split PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/split-pdf" />',
  )
})

test('no accessibility problems on any screen', async ({ page }) => {
  await page.goto('/split-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Split PDF')
  expect(await axeViolations(page)).toEqual([])

  await open(page)
  await page.getByRole('button', { name: 'Split after page 3' }).click()
  expect(await axeViolations(page)).toEqual([])

  await page.getByRole('button', { name: 'Split PDF' }).click()
  await expect(
    page.getByRole('button', { name: 'Download all (ZIP)' }),
  ).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
