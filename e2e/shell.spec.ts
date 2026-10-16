import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Collects console errors and uncaught exceptions, including privacy-policy
// (CSP) violations, which the browser reports as console errors.
function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('the home page loads', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  await expect(page).toHaveTitle('Tuls')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Everyday file tools.',
  )
  expect(errors).toEqual([])
})

test('an unknown address shows the not-found page', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/no-such-page')
  await expect(page).toHaveTitle('Page not found · Tuls')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Page not found',
  )
  expect(errors).toEqual([])
})

test('going to another page moves focus to its content', async ({ page }) => {
  await page.goto('/no-such-page')
  await page.getByRole('link', { name: 'Go to the home page' }).click()
  await expect(page).toHaveURL('/')
  await expect(page).toHaveTitle('Tuls')
  await expect(page.locator('main')).toBeFocused()
})

test('keyboard focus is visible', async ({ page, browserName }) => {
  await page.goto('/')
  // Safari's Tab skips links unless Option is held.
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
  const wordmark = page.getByRole('link', { name: 'Tuls' })
  await expect(wordmark).toBeFocused()
  await expect(wordmark).toHaveCSS('outline-style', 'solid')
  await expect(wordmark).toHaveCSS('outline-width', '2px')
})

for (const path of ['/', '/no-such-page']) {
  test(`no accessibility problems on ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
}

test('pages are sent with the privacy headers', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()
  expect(headers['content-security-policy']).toContain("connect-src 'self'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  // Cross-origin isolation is off for now. It stopped the video timeline's
  // thumbnails on iPhones, and only LibreOffice needs it (later, per page).
  expect(headers['cross-origin-embedder-policy']).toBeUndefined()
})
