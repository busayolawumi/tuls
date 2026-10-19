import { PDFDocument, PDFName, PDFString } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Test PDFs are made on the spot: blank pages, told apart by their size.
async function makePdf(
  name: string,
  size: [number, number],
  options: { password?: string; signed?: boolean } = {},
) {
  const doc = await PDFDocument.create()
  doc.addPage(size)
  doc.setAuthor('Ada Example')
  // A signed signature field (the signature itself made up).
  if (options.signed) {
    const { context } = doc
    const page = doc.getPage(0)
    const field = context.register(
      context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        T: PDFString.of('Signature1'),
        Rect: [10, 10, 100, 40],
        P: page.ref,
        V: context.register(
          context.obj({ Type: 'Sig', ByteRange: [0, 10, 20, 30] }),
        ),
      }),
    )
    page.node.set(PDFName.of('Annots'), context.obj([field]))
    doc.catalog.set(PDFName.of('AcroForm'), context.obj({ Fields: [field] }))
  }
  if (options.password) {
    doc.encrypt({
      userPassword: options.password,
      ownerPassword: options.password,
    })
  }
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save({ useObjectStreams: !options.signed })),
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

test('adds a password to PDFs without sending anything elsewhere', async ({
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

  await page.goto('/protect-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('a.pdf', [300, 400]),
      await makePdf('b.pdf', [500, 500], { signed: true }),
    ])
  const list = page.getByRole('list', { name: 'The PDFs' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(
    list.getByRole('listitem').nth(1).getByText('It’s digitally signed.', {
      exact: false,
    }),
  ).toBeVisible()

  // Typed differently the second time: the second box is the one to fix.
  const password = page.getByLabel('Password', { exact: true })
  const again = page.getByLabel('Type it again')
  await password.fill('correct horse 42')
  await again.fill('correct horse 24')
  await page.getByRole('button', { name: 'Add password to 2 PDFs' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'The two passwords don’t match.',
  )
  await expect(again).toBeFocused()
  await expect(again).toHaveAttribute('aria-invalid', 'true')

  // Show turns the dots into letters, in both boxes.
  await page.getByLabel('Show passwords').check()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(again).toHaveAttribute('type', 'text')

  await again.fill('correct horse 42')
  await page.getByRole('button', { name: 'Add password to 2 PDFs' }).click()
  const results = page.getByRole('list', { name: 'The protected PDFs' })
  await expect(results.getByRole('listitem')).toHaveCount(2)
  await expect(
    page.getByText('Keep the password somewhere safe.', { exact: false }),
  ).toBeVisible()

  for (const [name, width] of [
    ['a-protected.pdf', 300],
    ['b-protected.pdf', 500],
  ] as const) {
    const link = results.getByRole('link', { name: `Download ${name}` })
    const bytes = await fetchFile(page, (await link.getAttribute('href'))!)
    const raw = bytes.toString('latin1')
    expect(raw).toContain('/Encrypt')
    expect(raw).not.toContain('Ada Example')
    // pdf-lib can't open it without the password…
    await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i)
    // …and with it, it's the same page.
    const opened = await PDFDocument.load(bytes, {
      password: 'correct horse 42',
    })
    expect(opened.getPage(0).getWidth()).toBe(width)
  }

  // Back to the password screen, with the same PDFs and empty boxes.
  await page.getByRole('button', { name: 'Change the password' }).click()
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('one PDF, renamed before saving', async ({ page }) => {
  await page.goto('/protect-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('statement.pdf', [300, 400])])
  await page.getByLabel('Password', { exact: true }).fill('secret pass')
  await page.getByLabel('Type it again').fill('secret pass')
  await page.getByRole('button', { name: 'Add password', exact: true }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toHaveAttribute('download', 'statement-protected.pdf')
  await expect(page.getByText(/^1 page · /)).toBeVisible()
  await page.getByLabel('File name').fill('For the bank')
  await expect(download).toHaveAttribute('download', 'For the bank.pdf')
})

test('hints at short passwords, and warns about what Apple can’t open', async ({
  page,
}) => {
  await page.goto('/protect-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('a.pdf', [300, 400])])
  const password = page.getByLabel('Password', { exact: true })

  await password.fill('abc')
  await expect(
    page.getByText('Short passwords are easy to guess.', { exact: false }),
  ).toBeVisible()

  // Yoruba tones on dotted letters stay separate marks, even composed.
  await password.fill('ọ̀rọ̀ aṣínà 2026')
  await expect(
    page.getByText(
      'iPhones and Macs won’t open the PDF with this password, because of ọ̀.',
      { exact: false },
    ),
  ).toBeVisible()
  await expect(
    page.getByText('Short passwords', { exact: false }),
  ).not.toBeVisible()

  // Accents that compose are fine everywhere.
  await password.fill('Ọlá Àdé 2026')
  await expect(
    page.getByText('iPhones and Macs', { exact: false }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: 'Add password' }).click()
  await expect(page.getByRole('alert')).toHaveText('Type the password again.')
})

test('a PDF that already has a password points to Unlock PDF', async ({
  page,
}) => {
  await page.goto('/protect-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      await makePdf('locked.pdf', [300, 400], { password: 'secret' }),
    ])
  await expect(
    page.getByText(
      'locked.pdf: It already has a password. To change it, use Unlock PDF.',
    ),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Unlock PDF' }).click()
  await expect(page).toHaveURL(/\/unlock-pdf$/)
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/protect-pdf')).text()
  expect(html).toContain('<title>Protect PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.busayolawumi.dev/protect-pdf" />',
  )
})

test('no accessibility problems on any screen', async ({ page }) => {
  await page.goto('/protect-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Protect PDF',
  )
  expect(await axeViolations(page)).toEqual([])

  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('a.pdf', [300, 400], { signed: true })])
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('ọ̀rọ̀')
  await page.getByRole('button', { name: 'Add password' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  await page.getByLabel('Type it again').fill('ọ̀rọ̀')
  await page.getByRole('button', { name: 'Add password' }).click()
  await expect(page.getByRole('link', { name: 'Download PDF' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])
})
