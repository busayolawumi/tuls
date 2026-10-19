import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Test PDFs are made on the spot: blank pages, told apart by their size.
async function makePdf(
  name: string,
  size: [number, number],
  password?: string,
) {
  const doc = await PDFDocument.create()
  doc.addPage(size)
  doc.setTitle('Salary review')
  if (password) doc.encrypt({ userPassword: password, ownerPassword: 'owner' })
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

/** A file the page made, by its link's address. */
async function fetchFile(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  return Buffer.from(base64, 'base64')
}

test('takes passwords off, one password at a time, without sending anything elsewhere', async ({
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

  await page.goto('/unlock-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('jan.pdf', [300, 400], 'first'),
      await makePdf('feb.pdf', [500, 500], 'second'),
      await makePdf('open.pdf', [200, 200]),
    ])
  await expect(
    page.getByText('open.pdf: It doesn’t have a password.'),
  ).toBeVisible()
  const locked = page.getByRole('list', { name: 'The locked PDFs' })
  await expect(locked.getByRole('listitem')).toHaveCount(2)

  const password = page.getByLabel('Password', { exact: true })
  await password.fill('first')
  await page.getByRole('button', { name: 'Unlock 2 PDFs' }).click()
  await expect(page.getByRole('alert').last()).toHaveText(
    'That password didn’t open 1 of the 2 PDFs. Type its password and try again.',
  )
  await expect(
    page.getByText('1 PDF is unlocked.', { exact: false }),
  ).toBeVisible()
  await expect(locked.getByRole('listitem')).toHaveCount(1)
  await expect(locked).toContainText('feb.pdf')
  await expect(password).toBeFocused()

  await password.fill('second')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  const results = page.getByRole('list', { name: 'The unlocked PDFs' })
  await expect(results.getByRole('listitem')).toHaveCount(2)

  for (const [name, width] of [
    ['jan-unlocked.pdf', 300],
    ['feb-unlocked.pdf', 500],
  ] as const) {
    const link = results.getByRole('link', { name: `Download ${name}` })
    const bytes = await fetchFile(page, (await link.getAttribute('href'))!)
    const raw = bytes.toString('latin1')
    expect(raw).not.toContain('/Encrypt')
    expect(raw).not.toContain('Salary review')
    const opened = await PDFDocument.load(bytes)
    expect(opened.getPage(0).getWidth()).toBe(width)
  }

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('a wrong password, then carrying on without the PDF', async ({ page }) => {
  await page.goto('/unlock-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('a.pdf', [300, 400], 'right'),
      await makePdf('b.pdf', [500, 500], 'other'),
    ])
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('wrong')
  await page.getByRole('button', { name: 'Unlock 2 PDFs' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'That password didn’t open them. Check it and try again.',
  )
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  // Nothing is unlocked yet, so there's nothing to carry on with.
  await expect(page.getByRole('button', { name: /^Carry on/ })).toHaveCount(0)

  await password.fill('right')
  await page.getByRole('button', { name: 'Unlock 2 PDFs' }).click()
  await page.getByRole('button', { name: 'Carry on without it' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toHaveAttribute('download', 'a-unlocked.pdf')
  await expect(page.getByText(/^1 page · /)).toBeVisible()
})

test('unlocks what Protect PDF locked, with accents typed either way', async ({
  page,
}) => {
  // Protect a PDF with an accented password…
  await page.goto('/protect-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('notes.pdf', [300, 400])])
  const typed = 'Ọlá Àdé 2026'
  await page.getByLabel('Password', { exact: true }).fill(typed)
  await page.getByLabel('Type it again').fill(typed)
  await page.getByRole('button', { name: 'Add password', exact: true }).click()
  const link = page.getByRole('link', { name: 'Download PDF' })
  const bytes = await fetchFile(page, (await link.getAttribute('href'))!)

  // …then unlock it with the letters broken up, as Apple's keyboards send them.
  await page.goto('/unlock-pdf')
  await page.locator('input[type=file]').setInputFiles([
    {
      name: 'notes-protected.pdf',
      mimeType: 'application/pdf',
      buffer: bytes,
    },
  ])
  await page
    .getByLabel('Password', { exact: true })
    .fill(typed.normalize('NFD'))
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'Download PDF' }),
  ).toHaveAttribute('download', 'notes-protected-unlocked.pdf')
})

test('changes a password: unlocked, then given a new one before saving', async ({
  page,
}) => {
  const errors = watchErrors(page)
  await page.goto('/unlock-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('statement.pdf', [300, 400], 'old one')])
  await page.getByLabel('Password', { exact: true }).fill('old one')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()

  await page.getByRole('button', { name: 'give it a new password' }).click()
  await expect(
    page.getByText('A new password for statement.pdf.', { exact: false }),
  ).toBeVisible()
  // Back out, and in again.
  await page
    .getByRole('button', { name: 'Back without a new password' })
    .click()
  await expect(
    page.getByRole('link', { name: 'Download PDF' }),
  ).toHaveAttribute('download', 'statement-unlocked.pdf')
  await page.getByRole('button', { name: 'give it a new password' }).click()

  await page.getByLabel('Password', { exact: true }).fill('new one 2026')
  await page.getByLabel('Type it again').fill('new one 2026')
  await page.getByRole('button', { name: 'Add password' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toHaveAttribute('download', 'statement-protected.pdf')
  await expect(
    page.getByText('Keep the new password somewhere safe.', { exact: false }),
  ).toBeVisible()

  // The old password no longer opens it; the new one does.
  const bytes = await fetchFile(page, (await download.getAttribute('href'))!)
  await expect(
    PDFDocument.load(bytes, { password: 'old one' }),
  ).rejects.toThrow()
  const opened = await PDFDocument.load(bytes, { password: 'new one 2026' })
  expect(opened.getPage(0).getWidth()).toBe(300)

  // Back to choose another password, with empty boxes.
  await page.getByRole('button', { name: 'Choose another password' }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  expect(await axeViolations(page)).toEqual([])
  expect(errors).toEqual([])
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/unlock-pdf')).text()
  expect(html).toContain('<title>Unlock PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.busayolawumi.dev/unlock-pdf" />',
  )
})

test('no accessibility problems on any screen', async ({ page }) => {
  await page.goto('/unlock-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Unlock PDF')
  expect(await axeViolations(page)).toEqual([])

  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('a.pdf', [300, 400], 'right')])
  await page.getByLabel('Password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await page.getByLabel('Password', { exact: true }).fill('right')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
