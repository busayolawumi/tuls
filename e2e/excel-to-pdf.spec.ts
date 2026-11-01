import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The quick checks. Converting (Excel, then PowerPoint, with the engine kept
// running) is in office-to-pdf.spec.ts.

test('turns down files that aren’t Excel spreadsheets', async ({ page }) => {
  await page.goto('/excel-to-pdf')
  const input = page.locator('input[type=file]')
  for (const file of [
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
    {
      name: 'letter.docx',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('PK'),
    },
  ]) {
    await input.setInputFiles(file)
    await expect(page.getByRole('alert')).toHaveText(
      'That isn’t an Excel spreadsheet.',
    )
  }
})

test('the page is isolated, for the engine', async ({ request }) => {
  const headers = (await request.get('/excel-to-pdf')).headers()
  expect(headers['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers['cross-origin-embedder-policy']).toBe('require-corp')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/excel-to-pdf')).text()
  expect(html).toContain('<title>Excel to PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/excel-to-pdf" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/excel-to-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Excel to PDF',
  )
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
})
