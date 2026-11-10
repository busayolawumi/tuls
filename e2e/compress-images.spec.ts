import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// 64 × 48, Display P3, with the camera name "TulsTestCam" (fixtures/README.md).
const HEIC = readFileSync(new URL('./fixtures/turned-p3.heic', import.meta.url))
// A one-pixel GIF: as small as an image file gets.
const DOT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

/** A detailed photo-like JPEG, in Display P3 where the browser can. */
async function photo(page: Page, width: number, height: number, quality = 1) {
  const bytes = (await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = ${width}
    canvas.height = ${height}
    const context = canvas.getContext('2d', { colorSpace: 'display-p3' })
    const image = context.createImageData(${width}, ${height})
    let seed = 7
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let y = 0; y < ${height}; y++) {
      for (let x = 0; x < ${width}; x++) {
        const at = (y * ${width} + x) * 4
        const grain = random() * 70
        image.data[at] = (x * 200) / ${width} + grain
        image.data[at + 1] = (y * 180) / ${height} + grain
        image.data[at + 2] = 120 + grain
        image.data[at + 3] = 255
      }
    }
    context.putImageData(image, 0, 0)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', ${quality}))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })()`)) as number[]
  return Buffer.from(bytes)
}

/** A screenshot-like PNG: flat colours and text. */
async function screenshot(page: Page) {
  const bytes = (await page.evaluate(`(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 400
    const context = canvas.getContext('2d')
    context.fillStyle = '#f4f4f5'
    context.fillRect(0, 0, 600, 400)
    context.fillStyle = '#18181b'
    context.fillRect(0, 0, 120, 400)
    const gradient = context.createLinearGradient(0, 0, 600, 0)
    gradient.addColorStop(0, '#ea580c')
    gradient.addColorStop(1, '#2563eb')
    context.fillStyle = gradient
    context.fillRect(140, 300, 440, 80)
    for (let row = 0; row < 12; row++) {
      context.fillStyle = row % 2 ? '#111' : '#2563eb'
      context.font = '15px sans-serif'
      context.fillText('Row ' + row + ': the quick brown fox jumps over the lazy dog', 140, 30 + row * 22)
    }
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })()`)) as number[]
  return Buffer.from(bytes)
}

async function readMade(page: Page, href: string | null) {
  return (await page.evaluate(`(async () => {
    const blob = await (await fetch(${JSON.stringify(href)})).blob()
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bitmap = await createImageBitmap(blob)
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return {
      type: blob.type,
      size: blob.size,
      width: bitmap.width,
      height: bitmap.height,
      text,
    }
  })()`)) as {
    type: string
    size: number
    width: number
    height: number
    text: string
  }
}

test('compresses photos and screenshots, keeping colours, without sending anything elsewhere', async ({
  page,
  baseURL,
}, testInfo) => {
  test.slow()
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

  await page.goto('/compress-images')
  const jpeg = await photo(page, 800, 600)
  const png = await screenshot(page)
  await page.locator('input[type=file]').setInputFiles([
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    { name: 'screen.png', mimeType: 'image/png', buffer: png },
    { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC },
    { name: 'dot.gif', mimeType: 'image/gif', buffer: DOT_GIF },
  ])
  await expect(page.getByRole('radio', { name: 'Recommended' })).toBeChecked()
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: 'Compress 4 images' }).click()

  const photoLink = page.getByRole('link', {
    name: 'Download photo-compressed.jpg',
  })
  await expect(photoLink).toBeVisible({ timeout: 60_000 })
  const madePhoto = await readMade(page, await photoLink.getAttribute('href'))
  expect(madePhoto.type).toBe('image/jpeg')
  expect([madePhoto.width, madePhoto.height]).toEqual([800, 600])
  expect(madePhoto.size).toBeLessThan(jpeg.length * 0.6)
  if (testInfo.project.name !== 'firefox') {
    expect(madePhoto.text).toContain('ICC_PROFILE')
  }

  const madeScreen = await readMade(
    page,
    await page
      .getByRole('link', { name: 'Download screen-compressed.png' })
      .getAttribute('href'),
  )
  expect(madeScreen.type).toBe('image/png')
  expect([madeScreen.width, madeScreen.height]).toEqual([600, 400])
  expect(madeScreen.size).toBeLessThan(png.length * 0.7)
  // A palette PNG: colour type 3 in its header.
  expect(madeScreen.text.charCodeAt(25)).toBe(3)

  const heic = await readMade(
    page,
    await page
      .getByRole('link', { name: 'Download IMG_0001-compressed.jpg' })
      .getAttribute('href'),
  )
  expect([heic.width, heic.height]).toEqual([48, 64])
  expect(heic.text).not.toContain('TulsTestCam')

  // A one-pixel GIF can't get smaller: no copy, and said so.
  await expect(
    page.getByText(
      'Already about as small as it gets, so there’s no new copy:',
    ),
  ).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Images with no new copy' }),
  ).toContainText('dot.gif')

  // Before and after, by keyboard.
  const slider = page.getByRole('slider', {
    name: 'Before and after for photo-compressed.jpg',
  })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '55')
  await page.keyboard.press('Home')
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await page.getByRole('button', { name: 'Next image' }).click()
  await expect(page.getByText('(2 of 3)')).toBeVisible()
  await expect(
    page.getByRole('slider', {
      name: 'Before and after for screen-compressed.png',
    }),
  ).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('fits under a size, making the picture smaller when it has to', async ({
  page,
}) => {
  test.slow()
  await page.goto('/compress-images')
  const jpeg = await photo(page, 1600, 1200)
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'big.jpg', mimeType: 'image/jpeg', buffer: jpeg }])
  await page.getByText('Fit under a size', { exact: true }).click()
  const box = page.getByRole('textbox', { name: 'Each image under' })
  await box.fill('0.05')
  await page.getByRole('button', { name: 'Compress image' }).click()
  const link = page.getByRole('link', { name: /^Download JPG/ })
  await expect(link).toBeVisible({ timeout: 90_000 })
  await expect(link).toHaveAttribute('download', 'big-compressed.jpg')
  const made = await readMade(page, await link.getAttribute('href'))
  expect(made.size).toBeLessThanOrEqual(50_000)
  expect(made.width).toBeLessThan(1600)
  expect(made.width / made.height).toBeCloseTo(4 / 3, 1)
  await expect(
    page.getByText(`Made ${made.width} × ${made.height} to fit under 50 KB.`),
  ).toBeVisible()
})

test('says when images are already under the size, and checks the size typed', async ({
  page,
}) => {
  await page.goto('/compress-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'h.heic', mimeType: 'image/heic', buffer: HEIC }])
  await page.getByText('Fit under a size', { exact: true }).click()
  const box = page.getByRole('textbox', { name: 'Each image under' })
  await box.fill('0')
  await page.getByRole('button', { name: 'Compress image' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Type a size from 0.05 to 100 MB.',
  )
  await expect(box).toBeFocused()
  await box.fill('2,5')
  await page.getByRole('button', { name: 'Compress image' }).click()
  await expect(
    page.getByRole('heading', { name: 'Already under 2.5 MB' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try Smallest' })).toHaveCount(
    0,
  )

  await page.reload()
  await page
    .locator('input[type=file]')
    .setInputFiles([{ name: 'h.heic', mimeType: 'image/heic', buffer: HEIC }])
  await expect(
    page.getByRole('radio', { name: 'Fit under a size' }),
  ).toBeChecked()
  await expect(
    page.getByRole('textbox', { name: 'Each image under' }),
  ).toHaveValue('2,5')
})

test('offers Smallest when Recommended can’t help', async ({ page }) => {
  await page.goto('/compress-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'dot.gif', mimeType: 'image/gif', buffer: DOT_GIF },
    ])
  await page.getByRole('button', { name: 'Compress image' }).click()
  await expect(
    page.getByRole('heading', { name: 'Already about as small as it gets' }),
  ).toBeVisible({ timeout: 30_000 })
  expect(await axeViolations(page)).toEqual([])
  await page.getByRole('button', { name: 'Try Smallest' }).click()
  await expect(
    page.getByRole('heading', { name: 'Already about as small as it gets' }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Try Smallest' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('radio', { name: 'Smallest' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Try another size' }).click()
  await expect(page.getByRole('radio', { name: 'Smallest' })).toBeChecked()
})

test('turns down files that aren’t images', async ({ page }) => {
  await page.goto('/compress-images')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByRole('alert')).toContainText(
    'That isn’t an image Tuls can use.',
  )
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/compress-images')).text()
  expect(html).toContain('<title>Compress images · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/compress-images" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/compress-images')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Compress images',
  )
  expect(await axeViolations(page)).toEqual([])
})
