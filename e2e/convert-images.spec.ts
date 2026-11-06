import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makePng } from '../src/lib/images.testing.ts'

// The HEIC is 64 × 48, red on the left and blue on the right, in Display P3,
// marked to be turned a quarter clockwise, with the camera name
// "TulsTestCam" (fixtures/README.md). Upright, it's 48 × 64, red on top.
const HEIC = readFileSync(new URL('./fixtures/turned-p3.heic', import.meta.url))

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

async function files() {
  return [
    { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC },
    {
      name: 'sticker.png',
      mimeType: 'image/png',
      buffer: Buffer.from(await makePng(6, 4, { alpha: true })),
    },
  ]
}

/** A made file's bytes, size and two pixels, read in the page. */
async function readMade(page: Page, name: string) {
  const href = await page
    .getByRole('link', { name: `Download ${name}` })
    .getAttribute('href')
  return (await page.evaluate(`(async () => {
    const blob = await (await fetch(${JSON.stringify(href)})).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    const at = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data)
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return {
      type: blob.type,
      width: bitmap.width,
      height: bitmap.height,
      top: at(2, 2),
      bottom: at(2, bitmap.height - 3),
      text,
    }
  })()`)) as {
    type: string
    width: number
    height: number
    top: number[]
    bottom: number[]
    text: string
  }
}

test('converts a HEIC photo upright, in its colours, without its details', async ({
  page,
  baseURL,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (![baseURL!, 'blob:', 'data:'].some((start) => url.startsWith(start))) {
      elsewhere.push(url)
    }
  })

  await page.goto('/convert-images')
  await page.locator('input[type=file]').setInputFiles(await files())
  await expect(
    page.getByRole('list', { name: 'The images' }).getByRole('listitem'),
  ).toHaveCount(2)
  await expect(page.getByRole('radio', { name: 'JPG' })).toBeChecked()
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: 'Convert 2 images' }).click()

  await expect(
    page.getByRole('link', { name: 'Download IMG_0001.jpg' }),
  ).toBeVisible({ timeout: 60_000 })
  const photo = await readMade(page, 'IMG_0001.jpg')
  expect(photo.type).toBe('image/jpeg')
  expect([photo.width, photo.height]).toEqual([48, 64])
  // Red on top, blue below: turned the right way.
  expect(photo.top[0]).toBeGreaterThan(150)
  expect(photo.top[2]).toBeLessThan(110)
  expect(photo.bottom[2]).toBeGreaterThan(150)
  expect(photo.bottom[0]).toBeLessThan(110)
  expect(photo.text).not.toContain('TulsTestCam')
  expect(photo.text).not.toContain('Exif')
  // Chrome keeps the wider colours, with their profile.
  if (testInfo.project.name !== 'firefox') {
    expect(photo.text).toContain('ICC_PROFILE')
  }
  // The see-through PNG, as a JPG: on white.
  const sticker = await readMade(page, 'sticker.jpg')
  expect(sticker.top[0]).toBeGreaterThan(100)
  expect(sticker.top[1]).toBeGreaterThan(sticker.top[0])
  await expect(page.getByText('48 × 64 · from 1 KB')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  // WebP this time, with the same images.
  await page.getByRole('button', { name: 'Choose another format' }).click()
  await page.getByText('WebP', { exact: true }).click()
  await page.getByRole('button', { name: 'Convert 2 images' }).click()
  await expect(
    page.getByRole('link', { name: 'Download IMG_0001.webp' }),
  ).toBeVisible({ timeout: 60_000 })
  const webp = await readMade(page, 'IMG_0001.webp')
  expect(webp.text.slice(0, 4)).toBe('RIFF')
  expect(webp.text.slice(8, 12)).toBe('WEBP')
  expect([webp.width, webp.height]).toEqual([48, 64])
  expect(webp.text).not.toContain('TulsTestCam')
  const seeThrough = await readMade(page, 'sticker.webp')
  expect(seeThrough.top[3]).toBeLessThan(200)

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('the format is remembered, and files that aren’t images are turned down', async ({
  page,
}) => {
  await page.goto('/convert-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByRole('alert')).toContainText(
    'That isn’t an image Tuls can use.',
  )
  await page.locator('input[type=file]').setInputFiles(await files())
  await page.getByText('PNG', { exact: true }).click()
  await page.reload()
  await page.locator('input[type=file]').setInputFiles(await files())
  await expect(page.getByRole('radio', { name: 'PNG' })).toBeChecked()
})

test('an image that can’t be opened is named', async ({ page }) => {
  await page.goto('/convert-images')
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'broken.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from(HEIC.subarray(0, 300)),
    },
  ])
  await page.getByRole('button', { name: 'Convert image' }).click()
  await expect(
    page.getByText(/^broken\.heic: It couldn’t be opened/),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /^Download/ })).toHaveCount(0)
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/convert-images')).text()
  expect(html).toContain('<title>Convert images · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/convert-images" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/convert-images')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Convert images',
  )
  expect(await axeViolations(page)).toEqual([])
})
