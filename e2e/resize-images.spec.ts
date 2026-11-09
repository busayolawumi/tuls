import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { makePng } from '../src/lib/images.testing.ts'

// 64 × 48 and turned a quarter, so 48 × 64 upright, red on top
// (fixtures/README.md).
const HEIC = readFileSync(new URL('./fixtures/turned-p3.heic', import.meta.url))

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC }
const png = async (name: string, width: number, height: number) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(await makePng(width, height, { alpha: true })),
})

async function readMade(page: Page, href: string | null) {
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

test('resizes photos and keeps see-through parts, without sending anything elsewhere', async ({
  page,
  baseURL,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const elsewhere: string[] = []
  const requests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    requests.push(url)
    if (![baseURL!, 'blob:', 'data:'].some((start) => url.startsWith(start))) {
      elsewhere.push(url)
    }
  })

  await page.goto('/resize-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([heic, await png('sticker.png', 400, 200)])
  await expect(
    page.getByRole('list', { name: 'The images' }).getByRole('listitem'),
  ).toHaveCount(2)
  expect(await axeViolations(page)).toEqual([])
  await expect(page.getByRole('textbox', { name: 'Percentage' })).toHaveValue(
    '50',
  )
  await page.getByRole('button', { name: 'Resize 2 images' }).click()

  const photoLink = page.getByRole('link', {
    name: 'Download IMG_0001-resized.jpg',
  })
  await expect(photoLink).toBeVisible({ timeout: 60_000 })
  const photo = await readMade(page, await photoLink.getAttribute('href'))
  expect(photo.type).toBe('image/jpeg')
  expect([photo.width, photo.height]).toEqual([24, 32])
  // Red on top, blue below: turned the right way.
  expect(photo.top[0]).toBeGreaterThan(150)
  expect(photo.bottom[2]).toBeGreaterThan(150)
  expect(photo.text).not.toContain('TulsTestCam')
  expect(photo.text).not.toContain('Exif')
  if (testInfo.project.name !== 'firefox') {
    expect(photo.text).toContain('ICC_PROFILE')
  }
  const sticker = await readMade(
    page,
    await page
      .getByRole('link', { name: 'Download sticker-resized.png' })
      .getAttribute('href'),
  )
  expect(sticker.type).toBe('image/png')
  expect([sticker.width, sticker.height]).toEqual([200, 100])
  expect(sticker.top[3]).toBeGreaterThan(110)
  expect(sticker.top[3]).toBeLessThan(145)
  await expect(page.getByText(/48 × 64 → 24 × 32/)).toBeVisible()
  expect(requests.some((url) => url.includes('squoosh_resize'))).toBe(true)
  expect(await axeViolations(page)).toEqual([])

  // A size this time: wider images shrink, smaller ones stay as they are.
  await page.getByRole('button', { name: 'Choose another size' }).click()
  await page.getByText('Width and height', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Width' }).fill('100')
  await page.getByRole('button', { name: 'Resize 2 images' }).click()
  await expect(
    page.getByText('1 image was already smaller than that'),
  ).toBeVisible({ timeout: 60_000 })
  const wide = await readMade(
    page,
    await page
      .getByRole('link', { name: 'Download sticker-resized.png' })
      .getAttribute('href'),
  )
  expect([wide.width, wide.height]).toEqual([100, 50])
  const same = await readMade(
    page,
    await page
      .getByRole('link', { name: 'Download IMG_0001-resized.jpg' })
      .getAttribute('href'),
  )
  expect([same.width, same.height]).toEqual([48, 64])
  expect(same.text).not.toContain('TulsTestCam')

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('one image shows its new size, and fits inside both sides', async ({
  page,
}) => {
  await page.goto('/resize-images')
  await page
    .locator('input[type=file]')
    .setInputFiles(await png('wide.png', 400, 200))
  await expect(page.getByText('400 × 200 → 200 × 100')).toBeVisible({
    timeout: 30_000,
  })
  await page.getByText('Width and height', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Width' }).fill('100')
  await page.getByRole('textbox', { name: 'Height' }).fill('100')
  await expect(page.getByText('400 × 200 → 100 × 50')).toBeVisible()
  await page.getByRole('textbox', { name: 'Width' }).fill('900')
  await page.getByRole('textbox', { name: 'Height' }).fill('')
  await expect(page.getByText('It’s already smaller than that')).toBeVisible()
  await page.getByRole('textbox', { name: 'Width' }).fill('100')
  await page.getByRole('button', { name: 'Resize image' }).click()
  const link = page.getByRole('link', { name: /^Download PNG/ })
  await expect(link).toBeVisible({ timeout: 30_000 })
  await expect(link).toHaveAttribute('download', 'wide-resized.png')
  const made = await readMade(page, await link.getAttribute('href'))
  expect([made.width, made.height]).toEqual([100, 50])
})

test('asks for a size, and remembers the choice', async ({ page }) => {
  await page.goto('/resize-images')
  const files = await png('a.png', 40, 20)
  await page.locator('input[type=file]').setInputFiles(files)
  const percent = page.getByRole('textbox', { name: 'Percentage' })
  await percent.fill('100')
  await page.getByRole('button', { name: 'Resize image' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Type a percentage from 1 to 99.',
  )
  await expect(percent).toBeFocused()
  await expect(percent).toHaveAttribute('aria-invalid', 'true')
  await percent.fill('2x5')
  await expect(percent).toHaveValue('25')
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.getByText('Width and height', { exact: true }).click()
  await page.getByRole('button', { name: 'Resize image' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Type a width, a height, or both.',
  )
  await page.getByRole('textbox', { name: 'Height' }).fill('10')

  await page.reload()
  await page.locator('input[type=file]').setInputFiles(files)
  await expect(page.getByRole('textbox', { name: 'Height' })).toHaveValue('10')
})

test('turns down other files, and names images that can’t be opened', async ({
  page,
}) => {
  await page.goto('/resize-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByRole('alert')).toContainText(
    'That isn’t an image Tuls can use.',
  )
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'broken.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from(HEIC.subarray(0, 300)),
    },
  ])
  await page.getByRole('button', { name: 'Resize image' }).click()
  await expect(
    page.getByText(/^broken\.heic: It couldn’t be opened/),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /^Download/ })).toHaveCount(0)
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/resize-images')).text()
  expect(html).toContain('<title>Resize images · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/resize-images" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/resize-images')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Resize images',
  )
  expect(await axeViolations(page)).toEqual([])
})

test('on a phone, a very big image shrinks without reading all its pixels', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone')
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/resize-images')
  await page
    .locator('input[type=file]')
    .setInputFiles(await png('huge.png', 4200, 4100))
  await page.getByRole('button', { name: 'Resize image' }).click()
  const link = page.getByRole('link', { name: /^Download PNG/ })
  await expect(link).toBeVisible({ timeout: 60_000 })
  const made = await readMade(page, await link.getAttribute('href'))
  expect([made.width, made.height]).toEqual([2100, 2050])
  expect(made.top[3]).toBeGreaterThan(110)
  expect(made.top[3]).toBeLessThan(145)
  expect(requests.some((url) => url.includes('squoosh_resize'))).toBe(false)
})
