import { readFileSync } from 'node:fs'
import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Test PDFs are made on the spot: blank pages, told apart by their size.
async function makePdf(
  name: string,
  count: number,
  size: [number, number],
  password?: string,
) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage(size)
  if (password) doc.encrypt({ userPassword: password, ownerPassword: password })
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  }
}

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

test('merges PDFs in the chosen order without sending anything elsewhere', async ({
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

  await page.goto('/merge-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('a.pdf', 2, [300, 400]),
      await makePdf('b.pdf', 3, [500, 500]),
    ])
  const rows = page.getByRole('list', { name: 'PDFs to merge, in order' })
  await expect(rows.getByText('2 pages')).toBeVisible()
  await expect(rows.getByText('3 pages')).toBeVisible()

  // Put b.pdf first with the keyboard. Focus stays on the button, even now
  // it's at the top. (Pressed, not clicked: Safari doesn't focus a clicked
  // button.)
  const moveUp = page.getByRole('button', { name: 'Move b.pdf up' })
  await moveUp.focus()
  await page.keyboard.press('Enter')
  await expect(moveUp).toBeFocused()
  await expect(moveUp).toHaveAttribute('aria-disabled', 'true')
  await expect(rows.getByRole('listitem').first()).toContainText('b.pdf')

  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toBeVisible()
  await expect(download).toHaveAttribute('download', 'b-merged.pdf')
  await expect(page.getByText(/^5 pages · /)).toBeVisible()

  // Read the merged PDF back and check the page order by size.
  const href = (await download.getAttribute('href'))!
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  const merged = await PDFDocument.load(Buffer.from(base64, 'base64'))
  const sizes = merged.getPages().map((p) => p.getSize().width)
  expect(sizes).toEqual([500, 500, 500, 300, 300])

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('a password-protected PDF is named, and has to go before merging', async ({
  page,
}) => {
  await page.goto('/merge-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('open.pdf', 1, [300, 400]),
      await makePdf('locked.pdf', 1, [300, 400], 'secret'),
    ])
  await expect(
    page.getByText('This PDF has a password.', { exact: false }),
  ).toBeVisible()
  const merge = page.getByRole('button', { name: 'Merge 2 PDFs' })
  await expect(merge).toBeDisabled()

  await page.getByRole('button', { name: 'Remove locked.pdf' }).click()
  await expect(
    page.getByText('Add at least one more PDF to merge.'),
  ).toBeVisible()
})

test('a PDF locked against changes by Apple merges into a readable PDF', async ({
  page,
}) => {
  // pdf-lib alone garbled its text (src/engines/pdf/fixtures/README.md);
  // qpdf takes the lock off first, in the PDF worker.
  const errors = watchErrors(page)
  await page.goto('/merge-pdf')
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'statement.pdf',
      mimeType: 'application/pdf',
      buffer: readFileSync(
        'src/engines/pdf/fixtures/change-locked-by-apple.pdf',
      ),
    },
    await makePdf('b.pdf', 1, [500, 500]),
  ])
  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  const href = (await download.getAttribute('href'))!
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  const bytes = Buffer.from(base64, 'base64')
  expect(bytes.toString('latin1')).not.toContain('/Encrypt')
  const merged = await PDFDocument.load(bytes)
  expect(merged.getPages().map((p) => p.getSize().width)).toEqual([400, 500])
  expect(errors).toEqual([])
})

test('files that aren’t PDFs are turned down by name', async ({ page }) => {
  await page.goto('/merge-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('fine.pdf', 1, [300, 400]),
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByText('notes.txt: That isn’t a PDF.')).toBeVisible()
  const rows = page.getByRole('list', { name: 'PDFs to merge, in order' })
  await expect(rows.getByRole('listitem')).toHaveCount(1)
  await expect(rows).toContainText('fine.pdf')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/merge-pdf')).text()
  expect(html).toContain('<title>Merge PDFs · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/merge-pdf" />',
  )
})

test('no accessibility problems before or after choosing PDFs', async ({
  page,
}) => {
  await page.goto('/merge-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Merge PDFs')
  expect(await axeViolations(page)).toEqual([])

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      await makePdf('a.pdf', 2, [300, 400]),
      await makePdf('b.pdf', 1, [500, 500]),
    ])
  // Wait for both thumbnails, so the list has settled.
  await expect(page.locator('li img')).toHaveCount(2)
  expect(await axeViolations(page)).toEqual([])
})

test('the merged PDF can be renamed before it’s saved', async ({ page }) => {
  await page.goto('/merge-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('a.pdf', 1, [300, 400]),
      await makePdf('b.pdf', 1, [500, 500]),
    ])
  await page.getByRole('button', { name: 'Merge 2 PDFs' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  const name = page.getByRole('textbox', { name: 'File name' })
  // The usual name to start with, and the extension fixed after the box.
  await expect(name).toHaveValue('a-merged')
  await expect(page.getByText('.pdf', { exact: true })).toBeVisible()

  await name.fill('Bank statements Jan–Mar')
  await expect(download).toHaveAttribute(
    'download',
    'Bank statements Jan–Mar.pdf',
  )
  // Characters some systems don't allow go, and .pdf isn't doubled.
  await name.fill('Q1: in/out?.pdf')
  await expect(download).toHaveAttribute('download', 'Q1 inout.pdf')
  // Nothing typed: the usual name.
  await name.fill('')
  await expect(download).toHaveAttribute('download', 'a-merged.pdf')
})
