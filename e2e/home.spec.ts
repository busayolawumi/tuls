import { readFileSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function makePdf(name: string) {
  const doc = await PDFDocument.create()
  doc.addPage([200, 300])
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  }
}

const textFile = (name: string) => ({
  name,
  mimeType: 'application/octet-stream',
  buffer: Buffer.from('Not really one of these.'),
})

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  return errors
}

// The home page's file picker: the only file input on it.
const homePicker = (page: Page) => page.locator('input[type=file]')

const cards = (page: Page) => page.getByRole('main').getByRole('listitem')

test('the tools are grouped by kind', async ({ page }) => {
  await page.goto('/')
  const headings = page.getByRole('heading', { level: 2 })
  await expect(headings).toHaveText(['PDF', 'Documents', 'Images', 'Video'])
  const images = page.getByRole('region', { name: 'Images' })
  await expect(images.getByRole('link')).toHaveCount(3)
  await expect(images.getByRole('link').first()).toContainText('Convert images')
})

test('the kind buttons show one group at a time', async ({ page }) => {
  await page.goto('/')
  const kinds = page.getByRole('group', { name: 'Kinds of tools' })
  await expect(kinds.getByRole('button')).toHaveText([
    'All',
    'PDF',
    'Documents',
    'Images',
    'Video',
  ])
  await expect(kinds.getByRole('button', { name: 'All' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cards(page)).toHaveCount(17)

  await kinds.getByRole('button', { name: 'Images' }).click()
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Images'])
  await expect(cards(page)).toHaveText([
    /^Convert imagesHEIC to JPG/,
    /^Resize images/,
    /^Compress images/,
  ])
  expect(await axeViolations(page)).toEqual([])

  await kinds.getByRole('button', { name: 'All' }).click()
  await expect(cards(page)).toHaveCount(17)
})

test('searching narrows the list, best match first', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: 'Search tools' })

  await search.fill('combine')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['1 tool'])
  await expect(page.getByRole('status')).toHaveText('1 tool')
  await expect(cards(page)).toHaveText([/^Merge PDFs/])

  await search.fill('pdf to w')
  await expect(cards(page).first()).toContainText('PDF to Word')

  await search.fill('heic')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['4 tools'])

  await search.fill('xyzzy')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'No tools found',
  ])
  await expect(page.getByText('Nothing matches “xyzzy”.')).toBeVisible()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(search).toHaveValue('')
  await expect(search).toBeFocused()
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(
    0,
  )

  await search.fill('merge')
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
    'PDF',
  )
  expect(errors).toEqual([])
})

test('Enter opens the best match', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: 'Search tools' })
  await search.fill('password')
  await search.press('Enter')
  await expect(page).toHaveURL('/protect-pdf')
  await expect(page).toHaveTitle('Protect PDF · Tuls')
})

test('Enter loads an isolated tool afresh, so it gets its headers', async ({
  page,
}) => {
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: 'Search tools' })
  await search.fill('slides')
  await search.press('Enter')
  await expect(page).toHaveURL('/powerpoint-to-pdf')
  expect(await page.evaluate('self.crossOriginIsolated')).toBe(true)
})

test('a PDF chosen on the home page opens in the tool picked for it', async ({
  page,
}) => {
  const errors = watchErrors(page)
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      elsewhere.push(request.url())
  })
  await page.goto('/')
  await homePicker(page).setInputFiles(await makePdf('statement.pdf'))

  const heading = page.getByRole('heading', { name: 'Tools for statement.pdf' })
  await expect(heading).toBeFocused()
  await expect(cards(page)).toHaveCount(9)
  await expect(cards(page).first()).toContainText('Merge PDFs')
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  expect(await axeViolations(page)).toEqual([])

  await page.getByRole('link', { name: /^Split PDF/ }).click()
  await expect(page).toHaveURL('/split-pdf')
  await expect(page.getByText('This PDF has just one page')).toBeVisible()

  // Coming back, the file is gone: it was for that tool only.
  await page.getByRole('link', { name: 'Tuls' }).click()
  await page.getByRole('link', { name: /^Merge PDFs/ }).click()
  await expect(
    page.getByRole('button', { name: /browse|Choose PDFs/ }),
  ).toBeVisible()
  await expect(page.getByText('statement.pdf')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(elsewhere).toEqual([])
})

test('several files offer the tools that take them all', async ({ page }) => {
  await page.goto('/')
  await homePicker(page).setInputFiles([
    await makePdf('jan.pdf'),
    await makePdf('feb.pdf'),
  ])
  await expect(
    page.getByRole('heading', { name: 'Tools for these 2 files' }),
  ).toBeVisible()
  await expect(page.getByText('jan.pdf and feb.pdf')).toBeVisible()
  await expect(page.getByRole('link', { name: /^Split PDF/ })).toHaveCount(0)

  await page.getByRole('link', { name: /^Merge PDFs/ }).click()
  await expect(page).toHaveURL('/merge-pdf')
  await expect(page.getByText('jan.pdf')).toBeVisible()
  await expect(page.getByText('feb.pdf')).toBeVisible()
})

test('says plainly when no tool fits, and goes back to all tools', async ({
  page,
}) => {
  await page.goto('/')
  await homePicker(page).setInputFiles([
    await makePdf('a.pdf'),
    textFile('b.docx'),
  ])
  await expect(
    page.getByText('No one tool opens all of these together.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'See all tools' }).click()
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText(
    'PDF',
  )
  await expect(
    page.getByRole('button', { name: /see the tools that open them/ }),
  ).toBeFocused()
})

test('files dropped anywhere on the home page are looked at', async ({
  page,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'WebKit won’t take a made-up drop')
  await page.goto('/')
  await page.evaluate(`(() => {
    const data = new DataTransfer()
    data.items.add(new File(['x'], 'backup.zip'))
    for (const type of ['dragenter', 'dragover', 'drop'])
      document.body.dispatchEvent(
        new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }),
      )
  })()`)
  await expect(
    page.getByRole('heading', { name: 'Tools for backup.zip' }),
  ).toBeVisible()
  await expect(page.getByText('Tuls can’t open ZIP files yet.')).toBeVisible()
})

test('a video chosen on the home page opens in Video to GIF', async ({
  page,
}) => {
  await page.goto('/')
  await homePicker(page).setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: readFileSync('e2e/fixtures/test-pattern.mp4'),
  })
  await page.getByRole('link', { name: /^Video to GIF/ }).click()
  await expect(
    page.getByRole('button', { name: 'Convert to GIF' }),
  ).toBeVisible()
})

test('a document reaches Word to PDF across its fresh page load', async ({
  page,
}) => {
  const engine: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/engines/')) engine.push(request.url())
  })
  await page.goto('/')
  await homePicker(page).setInputFiles(textFile('notes.docx'))
  await page.getByRole('link', { name: /^Word to PDF/ }).click()
  await expect(page).toHaveURL('/word-to-pdf')
  expect(await page.evaluate('self.crossOriginIsolated')).toBe(true)
  // Not a real Word file, so it's turned down before the converter is
  // fetched, which shows it arrived.
  await expect(page.getByRole('alert')).toContainText('notes.docx:')
  expect(engine).toEqual([])

  // Taken once: reloading doesn't bring it back.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Word to PDF',
  )
  await expect(page.getByText('notes.docx')).toHaveCount(0)
})
