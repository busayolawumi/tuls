import { readFile } from 'node:fs/promises'
import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { unzipSync } from 'fflate'

// Test PDFs are made on the spot: blank pages told apart by their size in
// points. At 150 dpi a point is 150/72 pixels, so 144 points is 300 pixels.
async function makePdf(
  name: string,
  sizes: [number, number][],
  password?: string,
) {
  const doc = await PDFDocument.create()
  for (const size of sizes) doc.addPage(size)
  if (password) doc.encrypt({ userPassword: password, ownerPassword: password })
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  }
}

const THREE: [number, number][] = [
  [144, 216],
  [216, 144],
  [72, 72],
]

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

async function open(page: Page, sizes = THREE) {
  await page.goto('/pdf-to-images')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('report.pdf', sizes))
  const grid = page.getByRole('list', { name: 'Pages' })
  await expect(grid.getByRole('listitem')).toHaveCount(sizes.length)
  return grid
}

/** What kind of image the bytes are, and how big, from their header. */
function imageInfo(bytes: Uint8Array) {
  const data = Buffer.from(bytes)
  if (data.readUInt32BE(0) === 0x89504e47) {
    return {
      type: 'png',
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
    }
  }
  // A JPEG: find the frame header (SOF0 or SOF2), which has the size.
  let at = 2
  while (at < data.length) {
    const marker = data[at + 1]
    if (marker === 0xc0 || marker === 0xc2) {
      return {
        type: 'jpeg',
        height: data.readUInt16BE(at + 5),
        width: data.readUInt16BE(at + 7),
      }
    }
    at += 2 + data.readUInt16BE(at + 2)
  }
  return { type: 'unknown', width: 0, height: 0 }
}

test('turns the chosen pages into JPGs, without sending anything elsewhere', async ({
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
  await expect(page.getByText('All 3 pages')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Page 2' }).uncheck()
  await expect(page.getByText('2 of 3 pages')).toBeVisible()

  await page.getByRole('button', { name: 'Make images' }).click()
  const images = page.getByRole('list', { name: 'The images' })
  await expect(images.getByRole('listitem')).toHaveCount(2)
  await expect(images).toContainText('report-page-1.jpg')
  await expect(images).toContainText('Page 1 · 300×450')
  await expect(images).toContainText('report-page-3.jpg')

  await page.getByRole('textbox', { name: 'File names' }).fill('Slides')
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download all (ZIP)' }).click(),
  ])
  expect(zip.suggestedFilename()).toBe('Slides.zip')
  const files = unzipSync(await readFile(await zip.path()))
  expect(Object.keys(files)).toEqual(['Slides-page-1.jpg', 'Slides-page-3.jpg'])
  expect(imageInfo(files['Slides-page-1.jpg'])).toEqual({
    type: 'jpeg',
    width: 300,
    height: 450,
  })
  expect(imageInfo(files['Slides-page-3.jpg'])).toEqual({
    type: 'jpeg',
    width: 150,
    height: 150,
  })

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('one page as a high-quality PNG, and the choices are remembered', async ({
  page,
}) => {
  await open(page)
  await page.getByText('PNG', { exact: true }).click()
  await page.getByText('High', { exact: true }).click()
  await page.getByRole('button', { name: 'None' }).click()
  await expect(page.getByText('Choose at least one page.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Make images' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Page 3' }).check()
  await page.getByRole('button', { name: 'Make images' }).click()

  const download = page.getByRole('link', { name: 'Download image' })
  await expect(download).toHaveAttribute('download', 'report-page-3.png')
  const base64 = await page.evaluate(
    async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      let text = ''
      for (const byte of bytes) text += String.fromCharCode(byte)
      return btoa(text)
    },
    (await download.getAttribute('href'))!,
  )
  // 72 points at 300 dpi.
  expect(imageInfo(Buffer.from(base64, 'base64'))).toEqual({
    type: 'png',
    width: 300,
    height: 300,
  })

  await open(page)
  await expect(page.getByRole('radio', { name: 'PNG' })).toBeChecked()
  await expect(page.getByRole('radio', { name: 'High' })).toBeChecked()
})

test('making images can be stopped', async ({ page }) => {
  await open(page, Array(100).fill([612, 792]))
  await page.getByText('High', { exact: true }).click()
  await page.getByRole('button', { name: 'Make images' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Stopped. No images were made.')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Make images' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'The images' })).toHaveCount(0)
})

test('a password-protected PDF, or too many pages, gets a plain message', async ({
  page,
}) => {
  await page.goto('/pdf-to-images')
  const input = page.locator('input[type=file]')
  await input.setInputFiles(await makePdf('locked.pdf', [[72, 72]], 'secret'))
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has a password. Take it off first with Unlock PDF, then try again.',
  )
  await input.setInputFiles(
    await makePdf('long.pdf', Array(301).fill([72, 72])),
  )
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has 301 pages. PDF to images works with up to 300.',
  )
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/pdf-to-images')).text()
  expect(html).toContain('<title>PDF to images · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/pdf-to-images" />',
  )
})

test('no accessibility problems on any screen', async ({ page }) => {
  await page.goto('/pdf-to-images')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'PDF to images',
  )
  expect(await axeViolations(page)).toEqual([])

  const grid = await open(page)
  await expect(grid.locator('img')).toHaveCount(3)
  await page.getByRole('checkbox', { name: 'Page 2' }).uncheck()
  expect(await axeViolations(page)).toEqual([])

  await page.getByRole('button', { name: 'Make images' }).click()
  await expect(
    page.getByRole('button', { name: 'Download all (ZIP)' }),
  ).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
