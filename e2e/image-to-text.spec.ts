import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
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
  'Meeting moved to Thursday',
  'Room four at half past ten',
  'Bring the signed forms',
]

/**
 * A screenshot-like PNG: dark lines of text on white, drawn by the browser.
 * `sideways` turns it a quarter turn anticlockwise.
 */
async function textPng(page: Page, name: string, sideways = false) {
  const base64 = (await page.evaluate(`(async () => {
    const lines = ${JSON.stringify(LINES)}
    const upright = new OffscreenCanvas(1400, 560)
    const g = upright.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 1400, 560)
    g.fillStyle = '#111'
    g.font = '52px sans-serif'
    lines.forEach((line, i) => g.fillText(line, 80, 150 + i * 120))
    let canvas = upright
    if (${sideways}) {
      canvas = new OffscreenCanvas(560, 1400)
      const s = canvas.getContext('2d')
      s.translate(0, 1400)
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
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  }
}

async function plainPng(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(await makePng(300, 200)),
  }
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ')

test('lists the images and remembers the language', async ({ page }) => {
  const engine: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/engines/')) engine.push(request.url())
  })
  await page.goto('/image-to-text')
  await page
    .locator('input[type=file]')
    .setInputFiles([await plainPng('a.png'), await plainPng('b.png')])
  await expect(
    page.getByRole('list', { name: 'The images' }).getByRole('listitem'),
  ).toHaveCount(2)

  const languages = page.getByRole('group', { name: 'Language of the text' })
  await expect(languages.getByRole('radio')).toHaveCount(8)
  await expect(languages.getByRole('radio', { name: 'English' })).toBeChecked()
  await expect(
    page.getByRole('button', { name: 'Read 2 images' }),
  ).toBeVisible()
  await expect(
    page.getByText(/^The text reader for English is a [\d.]+ MB download/),
  ).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await languages.getByText('French').click()
  await page.reload()
  await page
    .locator('input[type=file]')
    .setInputFiles([await plainPng('a.png')])
  await expect(
    page
      .getByRole('group', { name: 'Language of the text' })
      .getByRole('radio', { name: 'French' }),
  ).toBeChecked()
  await expect(page.getByRole('button', { name: 'Read text' })).toBeVisible()

  // Nothing was read, so the reader wasn't needed.
  expect(engine).toEqual([])
})

test('keeps the first 20 images', async ({ page }) => {
  await page.goto('/image-to-text')
  const png = Buffer.from(await makePng(20, 20))
  await page.locator('input[type=file]').setInputFiles(
    Array.from({ length: 21 }, (_, i) => ({
      name: `shot-${i + 1}.png`,
      mimeType: 'image/png',
      buffer: png,
    })),
  )
  await expect(
    page.getByText('Up to 20 images can go in at once, so 1 was left out.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Read 20 images' }),
  ).toBeVisible()
})

test('a file that isn’t an image is turned down', async ({ page }) => {
  await page.goto('/image-to-text')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(page.getByRole('alert')).toContainText(
    'That isn’t an image Tuls can use.',
  )
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/image-to-text')).text()
  expect(html).toContain('<title>Image to text · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/image-to-text" />',
  )
  expect(html).toContain(
    '<meta property="og:image" content="https://tuls.bsyo.dev/og/image-to-text.png" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/image-to-text')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Image to text',
  )
  expect(await axeViolations(page)).toEqual([])
})

test(
  'reads images, turns a sideways one, and sends nothing elsewhere',
  { tag: '@engine' },
  async ({ page, baseURL, browserName, context }, testInfo) => {
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(240_000)
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    }
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

    await page.goto('/image-to-text')
    await page.locator('input[type=file]').setInputFiles([
      await textPng(page, 'notice.png'),
      await textPng(page, 'sideways.png', true),
      await plainPng('blank.png'),
      {
        name: 'broken.png',
        mimeType: 'image/png',
        buffer: Buffer.from('no'),
      },
    ])
    await page
      .getByRole('group', { name: 'Language of the text' })
      .getByText('English')
      .click()
    await page.getByRole('button', { name: 'Read 4 images' }).click()

    const results = page.getByRole('list', { name: 'The text' })
    await expect(results).toBeVisible({ timeout: 180_000 })
    await expect(results.getByRole('listitem')).toHaveCount(3)
    for (const name of ['notice.png', 'sideways.png']) {
      const text = oneLine(
        await page
          .getByRole('textbox', { name: `Text from ${name}` })
          .inputValue(),
      )
      for (const line of LINES) expect(text, name).toContain(line)
    }
    await expect(results.getByRole('listitem').nth(2)).toContainText(
      'No text found in it.',
    )
    await expect(
      page.getByRole('textbox', { name: 'Text from blank.png' }),
    ).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveText(
      'broken.png: Tuls can’t open this image.',
    )
    await expect(
      page.getByText(
        'Sideways or upside-down images were read the right way up.',
      ),
    ).toBeVisible()

    const [saved] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save as .txt' }).click(),
    ])
    expect(saved.suggestedFilename()).toBe('Text from images.txt')
    const file = await readFile((await saved.path())!, 'utf8')
    expect(file.startsWith('notice.png\n\n')).toBe(true)
    expect(file).toContain('\n\n\nsideways.png\n\n')
    expect(file.endsWith('blank.png\n\nNo text found in it.')).toBe(true)
    for (const line of LINES) expect(oneLine(file)).toContain(line)

    if (browserName === 'chromium') {
      await page.getByRole('button', { name: 'Copy all' }).click()
      await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
      expect(await page.evaluate('navigator.clipboard.readText()')).toBe(file)
    }

    expect(await axeViolations(page)).toEqual([])

    // Again, with the readers kept: nothing more of the engine is fetched.
    const engine = () =>
      fetched.filter((url) => url.includes('/engines/tesseract-')).length
    const before = engine()
    expect(before).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Choose another language' }).click()
    await page.getByRole('button', { name: 'Read 4 images' }).click()
    await expect(results).toBeVisible({ timeout: 120_000 })
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
    await page.goto('/image-to-text')
    const shot = await textPng(page, 'shot.png')
    await page.locator('input[type=file]').setInputFiles(
      Array.from({ length: 12 }, (_, i) => ({
        ...shot,
        name: `shot-${i + 1}.png`,
      })),
    )
    await page.getByRole('button', { name: 'Read 12 images' }).click()
    await expect(page.getByText(/^Reading image \d+ of 12…$/)).toBeVisible({
      timeout: 120_000,
    })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(
      page.getByRole('button', { name: 'Read 12 images' }),
    ).toBeVisible()
    await expect(page.getByText('Stopped. Nothing was read.')).toBeAttached()
    expect(errors).toEqual([])
  },
)
