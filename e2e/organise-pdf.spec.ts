import { PDFDocument } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Test PDFs are made on the spot: blank pages told apart by their widths.
async function makePdf(name: string, widths: number[], password?: string) {
  const doc = await PDFDocument.create()
  for (const width of widths) doc.addPage([width, 500])
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

async function open(page: Page, widths = [200, 300, 400, 500]) {
  await page.goto('/organise-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('report.pdf', widths))
  const grid = page.getByRole('list', { name: 'Pages, in order' })
  await expect(grid.locator('img')).toHaveCount(widths.length)
  return grid
}

/** A page's drag handle, e.g. "Page 3" (or "Page 3, turned 90°"). */
const handle = (page: Page, number: number) =>
  page.getByRole('button', { name: new RegExp(`^Page ${number}(,|$)`) })

test('reorders, rotates and deletes pages without sending anything elsewhere', async ({
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
  const grid = await open(page)

  await page.getByRole('button', { name: 'Rotate page 2' }).click()
  await expect(handle(page, 2)).toHaveAccessibleName('Page 2, turned 90°')

  // Pressed, not clicked: Safari doesn't focus a clicked button.
  const remove = page.getByRole('button', { name: 'Delete page 4' })
  await remove.focus()
  await page.keyboard.press('Enter')
  // The same button now keeps it, and still has focus.
  await expect(page.getByRole('button', { name: 'Keep page 4' })).toBeFocused()
  await expect(page.getByText('Keeping 3 of 4 pages')).toBeVisible()

  // Move page 3 to the front with the keyboard: pick up, left twice, drop.
  // Pages 1 to 3 share the first row at every screen width.
  await handle(page, 3).focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Picked up Page 3.')).toBeAttached()
  // dnd-kit starts listening for the arrow keys on a zero-delay timer after
  // the pick-up. A timer set now runs after it, so the keys aren't missed.
  await page.evaluate(() => new Promise((done) => setTimeout(done)))
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('Page 3 is over position 2 of 4.')).toBeAttached()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByText('Page 3 is over position 1 of 4.')).toBeAttached()
  await page.keyboard.press('Space')
  await expect(grid.getByRole('listitem').first()).toContainText('3')
  await expect(handle(page, 3)).toBeFocused()

  await page.getByRole('button', { name: 'Save PDF' }).click()
  const download = page.getByRole('link', { name: 'Download PDF' })
  await expect(download).toBeVisible()
  await expect(download).toHaveAttribute('download', 'report-organised.pdf')
  await page.getByRole('textbox', { name: 'File name' }).fill('Contract')
  await expect(download).toHaveAttribute('download', 'Contract.pdf')
  await expect(page.getByText(/^3 pages · /)).toBeVisible()

  // Read the new PDF back: page 3 first, page 2 turned, page 4 gone.
  const href = (await download.getAttribute('href'))!
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  const saved = await PDFDocument.load(Buffer.from(base64, 'base64'))
  expect(saved.getPages().map((p) => p.getSize().width)).toEqual([
    400, 200, 300,
  ])
  expect(saved.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 90])

  // Back to the pages, as they were left.
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByText('Keeping 3 of 4 pages')).toBeVisible()

  expect(elsewhere).toEqual([])
  expect(errors).toEqual([])
})

test('pages can be dragged with a mouse', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Phones drag by touch')
  const grid = await open(page)
  const from = (await handle(page, 1).boundingBox())!
  const to = (await handle(page, 3).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  const order = grid.getByRole('listitem')
  await expect(order.nth(0)).toContainText('2')
  await expect(order.nth(2)).toContainText('1')
})

test('rotate all turns every page, and every page can’t be deleted', async ({
  page,
}) => {
  await open(page, [200, 300])
  await page.getByRole('button', { name: 'Rotate all' }).click()
  await expect(handle(page, 1)).toHaveAccessibleName('Page 1, turned 90°')
  await expect(handle(page, 2)).toHaveAccessibleName('Page 2, turned 90°')

  await page.getByRole('button', { name: 'Delete page 1' }).click()
  await page.getByRole('button', { name: 'Delete page 2' }).click()
  await expect(page.getByText('Keep at least one page.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save PDF' })).toBeDisabled()
})

test('a password-protected PDF gets a plain message', async ({ page }) => {
  await page.goto('/organise-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('locked.pdf', [300], 'secret'))
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has a password. Take it off first with Unlock PDF, then try again.',
  )
})

test('a PDF with too many pages is turned down', async ({ page }) => {
  await page.goto('/organise-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles(await makePdf('long.pdf', Array(501).fill(300)))
  await expect(page.getByRole('alert')).toHaveText(
    'This PDF has 501 pages. Organise PDF works with up to 500.',
  )
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/organise-pdf')).text()
  expect(html).toContain('<title>Organise PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/organise-pdf" />',
  )
})

test('no accessibility problems before or after choosing a PDF', async ({
  page,
}) => {
  await page.goto('/organise-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Organise PDF',
  )
  expect(await axeViolations(page)).toEqual([])

  await open(page)
  await page.getByRole('button', { name: 'Rotate page 1' }).click()
  await page.getByRole('button', { name: 'Delete page 2' }).click()
  expect(await axeViolations(page)).toEqual([])
})
