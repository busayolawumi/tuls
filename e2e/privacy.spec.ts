import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('the footer links to the privacy page', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Privacy' })
    .click()
  await expect(page).toHaveURL('/privacy')
  await expect(page).toHaveTitle('Privacy · Tuls')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy')
  await expect(page.locator('main')).toBeFocused()
  expect(errors).toEqual([])
})

test('a direct visit gets the page and its sections', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/privacy')
  await expect(page).toHaveTitle('Privacy · Tuls')
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Your files',
    'What Tuls downloads',
    'What stays on your device',
    'The files you get',
    'No tracking',
    'Check for yourself',
  ])
  await expect(
    page.getByRole('link', { name: 'read it on GitHub' }),
  ).toHaveAttribute('href', 'https://github.com/busayolawumi/tuls')
  expect(errors).toEqual([])
})

test('the page has its own title and link preview', async ({ request }) => {
  const response = await request.get('/privacy')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('<title>Privacy · Tuls</title>')
  expect(html).toContain(
    '<link rel="canonical" href="https://tuls.bsyo.dev/privacy" />',
  )
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/privacy" />',
  )
  expect(html).toContain(
    '<meta property="og:image" content="https://tuls.bsyo.dev/og-image.png" />',
  )
  expect(html).not.toContain('noindex')
  expect(response.headers()['content-security-policy']).toContain(
    "connect-src 'self'",
  )
})

test('no accessibility problems on the privacy page', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})
