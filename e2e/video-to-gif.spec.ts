import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const video = fileURLToPath(
  new URL('./fixtures/test-pattern.mp4', import.meta.url),
)

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

test('the home page links to the tool', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Video to GIF/ }).click()
  await expect(page).toHaveURL('/video-to-gif')
  await expect(page).toHaveTitle('Video to GIF · Tuls')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Video to GIF',
  )
})

test(
  'turns a video into a GIF without sending anything to another site',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    // One conversion is enough, and the 32 MB engine makes it the slow one.
    // It runs on its own after the other tests (the "engines" project in
    // playwright.config.ts), or in a config's "light" project.
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(120_000)
    const errors = watchErrors(page)
    const elsewhere: string[] = []
    page.on('request', (request) => {
      const url = request.url()
      const local = [baseURL!, 'blob:', 'data:'].some((start) =>
        url.startsWith(start),
      )
      if (!local) elsewhere.push(url)
    })

    await page.goto('/video-to-gif')
    await page.locator('input[type=file]').setInputFiles(video)
    await page.getByRole('button', { name: 'Convert to GIF' }).click()

    const download = page.getByRole('link', { name: 'Download GIF' })
    await expect(download).toBeVisible({ timeout: 90_000 })
    await expect(download).toHaveAttribute('download', 'test-pattern.gif')
    await expect(page.getByText(/320×240 · 3\.0s/)).toBeVisible()
    await page.getByRole('textbox', { name: 'File name' }).fill('Waving cat')
    await expect(download).toHaveAttribute('download', 'Waving cat.gif')

    const href = (await download.getAttribute('href'))!
    const gif = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      return {
        start: String.fromCharCode(...bytes.slice(0, 6)),
        size: bytes.length,
      }
    }, href)
    expect(gif.start).toBe('GIF89a')
    expect(gif.size).toBeGreaterThan(1000)

    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)

test('a file that isn’t a video gets a plain message', async ({ page }) => {
  await page.goto('/video-to-gif')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  })
  await expect(
    page.getByText("That doesn't look like a video. Try an MP4, MOV or WebM."),
  ).toBeVisible()
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/video-to-gif')).text()
  expect(html).toContain('<title>Video to GIF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.busayolawumi.dev/video-to-gif" />',
  )
})

test('no accessibility problems before or after choosing a video', async ({
  page,
}) => {
  await page.goto('/video-to-gif')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await page.locator('input[type=file]').setInputFiles(video)
  await expect(
    page.getByRole('button', { name: 'Convert to GIF' }),
  ).toBeVisible()
  // Let the editor settle first: the timeline's thumbnails fill in one by
  // one, and checking colours mid-way gave the odd false result.
  await expect(page.locator('img[src^="data:image/jpeg"]')).toHaveCount(10)
  expect(await axeViolations(page)).toEqual([])
})
