import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const cards = (page: import('@playwright/test').Page) =>
  page.getByRole('main').getByRole('listitem')

test('the tools are grouped by kind', async ({ page }) => {
  await page.goto('/')
  const headings = page.getByRole('heading', { level: 2 })
  await expect(headings).toHaveText(['PDF', 'Documents', 'Images', 'Video'])
  const images = page.getByRole('region', { name: 'Images' })
  await expect(images.getByRole('link')).toHaveCount(3)
  await expect(images.getByRole('link').first()).toContainText('Convert images')
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
