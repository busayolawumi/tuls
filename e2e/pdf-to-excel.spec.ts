import { PDFDocument, StandardFonts, type PDFFont } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { TINY_JPEG } from '../src/lib/images.testing.ts'

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

const asFile = async (name: string, doc: PDFDocument) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(await doc.save()),
})

/** A bank statement over two pages, with no lines, as banks print them. */
async function statement() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const write = (
    page: ReturnType<PDFDocument['addPage']>,
    font: PDFFont,
    text: string,
    x: number,
    y: number,
    right = false,
  ) =>
    page.drawText(text, {
      x: right ? x - font.widthOfTextAtSize(text, 9) : x,
      y,
      size: 9,
      font,
    })
  const columns: [number, boolean][] = [
    [50, false],
    [120, false],
    [420, true],
    [490, true],
    [560, true],
  ]
  const pages = [
    [
      ['', 'Balance brought forward', '', '', '1,000.00'],
      ['02 Jan 2026', 'TESCO STORES', '12.50', '', '987.50'],
      ['03 Jan 2026', 'SALARY ACME LTD', '', '2,500.00', '3,487.50'],
      ['04 Jan 2026', 'RENT', '900.00', '', '2,587.50'],
    ],
    [
      ['05 Jan 2026', 'UBER TRIP', '8.10', '', '2,579.40'],
      ['06 Jan 2026', 'INTEREST', '', '0.42', '2,579.82'],
    ],
  ]
  for (const [n, rows] of pages.entries()) {
    const page = doc.addPage([595, 842])
    write(page, font, 'Example Bank plc', 50, 790)
    let y = 740
    for (const row of [
      ['Date', 'Description', 'Money out', 'Money in', 'Balance'],
      ...rows,
    ]) {
      row.forEach((text, i) => {
        if (text) write(page, font, text, columns[i][0], y, columns[i][1])
      })
      y -= 14
    }
    write(page, font, `Page ${n + 1} of 2`, 500, 40)
  }
  doc.setAuthor('Ada Example')
  doc.setTitle('Secret statement')
  return asFile('statement.pdf', doc)
}

async function letter() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  for (let i = 0; i < 8; i++) {
    page.drawText('An ordinary letter, with no table anywhere in it at all.', {
      x: 72,
      y: 760 - i * 16,
      size: 11,
      font,
    })
  }
  return asFile('letter.pdf', doc)
}

async function scan() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  page.drawImage(await doc.embedJpg(TINY_JPEG), {
    x: 0,
    y: 0,
    width: 300,
    height: 300,
  })
  return asFile('scan.pdf', doc)
}

async function locked() {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  doc.encrypt({ userPassword: 'secret', ownerPassword: 'secret' })
  return asFile('locked.pdf', doc)
}

async function fetchFile(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  return Buffer.from(base64, 'base64')
}

test('scans and locked PDFs are named before anything downloads', async ({
  page,
}) => {
  const fetched: string[] = []
  page.on('request', (request) => fetched.push(request.url()))
  await page.goto('/pdf-to-excel')
  await page
    .locator('input[type=file]')
    .setInputFiles([await scan(), await locked()])
  await expect(
    page.getByText(
      'scan.pdf: It’s scanned, so its pages are pictures, and Tuls can’t read tables in pictures yet.',
    ),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText(/^locked\.pdf: This PDF has a password/),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Unlock PDF' })).toBeVisible()
  expect(fetched.some((url) => url.includes('/engines/pymupdf-'))).toBe(false)
  expect(await axeViolations(page)).toEqual([])
})

test('files that aren’t PDFs are turned down', async ({ page }) => {
  await page.goto('/pdf-to-excel')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByRole('alert')).toContainText('That isn’t a PDF.')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/pdf-to-excel')).text()
  expect(html).toContain('<title>PDF to Excel · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.busayolawumi.dev/pdf-to-excel" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/pdf-to-excel')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'PDF to Excel',
  )
  expect(await axeViolations(page)).toEqual([])
})

test(
  'finds a statement’s table over two pages and makes a spreadsheet of it',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(240_000)
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

    await page.goto('/pdf-to-excel')
    await page
      .locator('input[type=file]')
      .setInputFiles([await statement(), await letter()])

    const table = page.getByRole('checkbox', {
      name: 'Pages 1–2, 6 rows × 5 columns',
    })
    await expect(table).toBeChecked({ timeout: 180_000 })
    await expect(page.getByText('No tables found in it.')).toBeVisible()
    const preview = page.getByRole('table', {
      name: 'The first rows of pages 1–2',
    })
    await expect(preview.getByRole('row').first()).toHaveText(
      'DateDescriptionMoney outMoney inBalance',
    )
    await expect(page.getByText('and 2 more rows')).toBeVisible()
    expect(await axeViolations(page)).toEqual([])

    await table.uncheck()
    const make = page.getByRole('button', { name: 'Make Excel file' })
    await expect(make).toBeDisabled()
    await expect(page.getByText('Tick at least one table.')).toBeVisible()
    await table.check()
    await make.click()

    const download = page.getByRole('link', { name: 'Download Excel file' })
    await expect(download).toHaveAttribute('download', 'statement.xlsx')
    await expect(page.getByText(/^1 table · /)).toBeVisible()
    const parts = unzipSync(
      new Uint8Array(
        await fetchFile(page, (await download.getAttribute('href'))!),
      ),
    )
    const book = strFromU8(parts['xl/workbook.xml'])
    const sheet = strFromU8(parts['xl/worksheets/sheet1.xml'])
    expect(book).toContain('name="Pages 1–2"')
    expect(sheet).toContain('>Balance brought forward<')
    expect(sheet).toContain('>UBER TRIP<')
    // 02 Jan 2026 as a date, and amounts as numbers.
    expect(sheet).toContain('<v>46024</v>')
    expect(sheet).toContain('<v>2500</v>')
    expect(sheet).toContain('<v>2579.82</v>')
    expect(sheet.match(/<row /g)).toHaveLength(7)
    const everything = Object.values(parts)
      .map((bytes) => strFromU8(bytes))
      .join('')
    expect(everything).not.toContain('Ada Example')
    expect(everything).not.toContain('Secret statement')
    expect(strFromU8(parts['docProps/app.xml'])).toContain(
      '<Application>Tuls</Application>',
    )
    expect(await axeViolations(page)).toEqual([])

    await page.getByRole('button', { name: 'Back to the tables' }).click()
    await expect(table).toBeChecked()

    for (const extra of ['numpy-', 'opencv_python-', 'pdf2docx-', 'lxml-']) {
      expect(
        fetched.some((url) => url.includes(extra)),
        extra,
      ).toBe(false)
    }
    expect(fetched.filter((url) => url.endsWith('/pyodide.js'))).toHaveLength(1)
    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)
