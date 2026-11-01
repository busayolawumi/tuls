import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  exifSegment,
  makePng,
  TINY_JPEG,
  withSegments,
} from '../src/lib/images.testing.ts'

// Test images are made by code, never anyone's photos. The JPEG is 8 × 4
// pixels; with EXIF orientation 6 it shows as 4 × 8.

const image = (name: string, mimeType: string, bytes: Uint8Array) => ({
  name,
  mimeType,
  buffer: Buffer.from(bytes),
})

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

async function choose(page: Page, files: ReturnType<typeof image>[]) {
  await page.goto('/images-to-pdf')
  await page.locator('input[type=file]').setInputFiles(files)
  return page.getByRole('list', { name: 'Images, in page order' })
}

/** The new PDF, read back from its blob: address. */
async function madePdf(page: Page) {
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toBeVisible()
  const base64 = await page.evaluate(
    async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    (await download.getAttribute('href'))!,
  )
  const bytes = Buffer.from(base64, 'base64')
  return {
    name: await download.getAttribute('download'),
    text: bytes.toString('latin1'),
    doc: await PDFDocument.load(bytes),
  }
}

const sizes = (doc: PDFDocument) =>
  doc.getPages().map((page) => Object.values(page.getSize()))

test('makes a PDF in the chosen order, upright, without the images’ details', async ({
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
  const photo = withSegments(TINY_JPEG, [
    exifSegment({ orientation: 6, note: 'GPS 6.5244N 3.3792E' }),
  ])
  const grid = await choose(page, [
    image('photo.jpg', 'image/jpeg', photo),
    image(
      'wide.png',
      'image/png',
      await makePng(6, 3, { note: 'Taken at home' }),
    ),
  ])
  await expect(grid.locator('img')).toHaveCount(2)

  // Same as image is the default. Put wide.png first with the keyboard,
  // then turn it.
  await page.getByRole('button', { name: /^wide\.png/ }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Picked up wide.png.')).toBeAttached()
  await page.evaluate(() => new Promise((done) => setTimeout(done)))
  await page.keyboard.press('ArrowLeft')
  await expect(
    page.getByText('wide.png is over position 1 of 2.'),
  ).toBeAttached()
  await page.keyboard.press('Space')
  await expect(
    grid
      .getByRole('listitem')
      .first()
      .getByRole('button', { name: /^wide\.png/ }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Rotate wide.png' }).click()
  await expect(
    page.getByRole('button', { name: 'wide.png, turned 90°' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Make PDF' }).click()
  await expect(page.getByText(/^2 pages · /)).toBeVisible()
  const { name, text, doc } = await madePdf(page)
  expect(name).toBe('wide.pdf')
  await page.getByRole('textbox', { name: 'File name' }).fill('Receipts')
  await expect(
    page.getByRole('link', { name: 'Download PDF' }),
  ).toHaveAttribute('download', 'Receipts.pdf')
  // 6 × 3 turned, then 4 × 8 (upright from EXIF), at 0.75 points a pixel.
  expect(sizes(doc)).toEqual([
    [2.25, 4.5],
    [3, 6],
  ])
  for (const detail of ['GPS', 'Exif', 'Taken at home']) {
    expect(text).not.toContain(detail)
  }

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('starts with the image’s own size, and remembers the choice', async ({
  page,
}) => {
  await choose(page, [image('photo.jpg', 'image/jpeg', TINY_JPEG)])
  const radios = page.getByRole('radio')
  for (const [i, name] of ['Same as image', 'A4', 'Letter'].entries()) {
    await expect(radios.nth(i)).toHaveAccessibleName(name)
  }
  await expect(page.getByRole('radio', { name: 'Same as image' })).toBeChecked()
  await page.getByText('A4', { exact: true }).click()

  await choose(page, [image('photo.jpg', 'image/jpeg', TINY_JPEG)])
  await expect(page.getByRole('radio', { name: 'A4' })).toBeChecked()
  await page.getByRole('button', { name: 'Make PDF' }).click()
  // The 8 × 4 photo is wide, so the A4 page is too.
  expect(sizes((await madePdf(page)).doc)).toEqual([[841.89, 595.28]])
})

test('see-through WebP images are redrawn and kept see-through', async ({
  page,
}) => {
  await page.goto('/images-to-pdf')
  // Drawn by Chrome (half see-through red, then clear). A string, as this
  // runs in the page, where there's a document.
  const webp: number[] = await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 6
    canvas.height = 4
    const context = canvas.getContext('2d')
    context.fillStyle = 'rgba(255, 0, 0, 0.5)'
    context.fillRect(0, 0, 3, 4)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/webp'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })()`)
  const grid = await choose(page, [
    image('sticker.webp', 'image/webp', new Uint8Array(webp)),
  ])
  await expect(grid.locator('img')).toHaveCount(1)
  await page.getByRole('button', { name: 'Make PDF' }).click()
  const { text, doc } = await madePdf(page)
  expect(sizes(doc)).toEqual([[4.5, 3]])
  // Redrawn as a PNG, whose see-through parts become a soft mask.
  expect(text).toContain('/SMask')
})

test('images that can’t be opened are named, and have to go first', async ({
  page,
}) => {
  await choose(page, [
    image('photo.jpg', 'image/jpeg', TINY_JPEG),
    // Not a real HEIC, and Chrome can't open real ones either.
    image('IMG_0001.heic', 'image/heic', new Uint8Array(64).fill(7)),
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
  ])
  await expect(
    page.getByText(
      'notes.txt: That isn’t an image Tuls can use. Try a JPG, PNG, WebP, GIF or HEIC.',
    ),
  ).toBeVisible()
  await expect(page.getByText('Can’t open this image')).toBeVisible()
  await expect(
    page.getByText(
      'This browser can’t open HEIC photos. Remove them, or try Safari.',
    ),
  ).toBeVisible()
  const make = page.getByRole('button', { name: 'Make PDF' })
  await expect(make).toBeDisabled()

  await page.getByRole('button', { name: 'Remove IMG_0001.heic' }).click()
  await expect(page.getByText('1 image', { exact: true })).toBeVisible()
  await expect(make).toBeEnabled()
})

test('takes up to 100 images, and says what was left out', async ({ page }) => {
  const photos = Array.from({ length: 101 }, (_, i) =>
    image(`photo-${i + 1}.jpg`, 'image/jpeg', TINY_JPEG),
  )
  await choose(page, photos)
  await expect(
    page.getByText('One PDF can have up to 100 images, so 1 was left out.'),
  ).toBeVisible()
  await expect(page.getByText('100 images', { exact: true })).toBeVisible({
    timeout: 20_000,
  })
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/images-to-pdf')).text()
  expect(html).toContain('<title>Images to PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/images-to-pdf" />',
  )
})

test('no accessibility problems before or after choosing images', async ({
  page,
}) => {
  await page.goto('/images-to-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Images to PDF',
  )
  expect(await axeViolations(page)).toEqual([])

  const grid = await choose(page, [
    image('photo.jpg', 'image/jpeg', TINY_JPEG),
    image('square.png', 'image/png', await makePng(4, 4)),
  ])
  await expect(grid.locator('img')).toHaveCount(2)
  await page.getByRole('button', { name: 'Rotate photo.jpg' }).click()
  expect(await axeViolations(page)).toEqual([])
})
