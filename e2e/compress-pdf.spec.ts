import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib'
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

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

/** A photo-like JPEG, drawn by the browser's canvas, as bytes. */
async function photoJpeg(page: Page, size: number, quality = 0.95) {
  // As a string: these tests have no DOM types.
  const base64 = (await page.evaluate(`(async () => {
    const size = ${size}
    const canvas = new OffscreenCanvas(size, size)
    const g = canvas.getContext('2d')
    for (let y = 0; y < size; y += 3) {
      for (let x = 0; x < size; x += 3) {
        const v = (Math.sin(x / 37) + Math.cos(y / 23) + 2) * 60
        g.fillStyle = 'rgb(' + (v % 256) + ',' + (x * 255) / size + ',' + (y * 255) / size + ')'
        g.fillRect(x, y, 3, 3)
      }
    }
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: ${quality} })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  })()`)) as string
  return Buffer.from(base64, 'base64')
}

/** A PDF with text, and a photo shown 4 inches wide if given. */
async function makePdf(name: string, options: { photo?: Buffer } = {}) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Quarterly statement', { x: 20, y: 370, size: 14, font })
  if (options.photo) {
    const photo = await doc.embedJpg(options.photo)
    page.drawImage(photo, { x: 20, y: 20, width: 288, height: 288 })
  }
  doc.setAuthor('Ada Example')
  return {
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  }
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

test('choosing PDFs: the level, remembered, and a password PDF pointed to Unlock PDF', async ({
  page,
}) => {
  await page.goto('/compress-pdf')
  const locked = await PDFDocument.create()
  locked.addPage([200, 200])
  locked.encrypt({ userPassword: 'secret', ownerPassword: 'secret' })
  await page.locator('input[type=file]').setInputFiles([
    await makePdf('statement.pdf'),
    {
      name: 'locked.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await locked.save()),
    },
  ])
  await expect(
    page.getByText(
      'locked.pdf: It has a password. Take it off first with Unlock PDF.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Unlock PDF' })).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'The PDFs' }).getByRole('listitem'),
  ).toHaveCount(1)

  const recommended = page.getByRole('radio', { name: 'Recommended' })
  await expect(recommended).toBeChecked()
  await expect(
    page.getByText('Looks the same on screen and prints well.'),
  ).toBeVisible()
  await page.getByText('Smallest', { exact: true }).click()
  await expect(
    page.getByText('Fine on screen. Photos print softer.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compress' })).toBeVisible()
  expect(await axeViolations(page)).toEqual([])

  // Remembered next time.
  await page.reload()
  await page
    .locator('input[type=file]')
    .setInputFiles([await makePdf('statement.pdf')])
  await expect(page.getByRole('radio', { name: 'Smallest' })).toBeChecked()
})

test('files that aren’t PDFs are turned down', async ({ page }) => {
  await page.goto('/compress-pdf')
  await page
    .locator('input[type=file]')
    .setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') },
    ])
  await expect(page.getByRole('alert')).toContainText('That isn’t a PDF.')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/compress-pdf')).text()
  expect(html).toContain('<title>Compress PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/compress-pdf" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/compress-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Compress PDF',
  )
  expect(await axeViolations(page)).toEqual([])
})

test(
  'compresses PDFs with the light engine, without sending anything elsewhere',
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

    await page.goto('/compress-pdf')
    // 2400 pixels shown 4 inches wide: 600 dpi.
    const photo = await photoJpeg(page, 2400)
    await page
      .locator('input[type=file]')
      .setInputFiles([await makePdf('photo.pdf', { photo })])
    await page.getByRole('radio', { name: 'Recommended' }).check()
    await page.getByRole('button', { name: 'Compress', exact: true }).click()

    const download = page.getByRole('link', { name: 'Download PDF' })
    await expect(download).toBeVisible({ timeout: 180_000 })
    await expect(download).toHaveAttribute('download', 'photo-compressed.pdf')
    await expect(page.getByText(/% smaller$/)).toBeVisible()

    const bytes = await fetchFile(page, (await download.getAttribute('href'))!)
    expect(bytes.length).toBeLessThan(photo.length / 2)
    expect(bytes.toString('latin1')).not.toContain('Ada Example')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPage(0).getWidth()).toBe(400)

    // The light start: Python and PyMuPDF, none of PDF to Word's extras.
    for (const extra of ['numpy-', 'opencv_python-', 'pdf2docx-', 'lxml-']) {
      expect(
        fetched.some((url) => url.includes(extra)),
        extra,
      ).toBe(false)
    }
    expect(fetched.filter((url) => url.endsWith('/pyodide.js'))).toHaveLength(1)
    expect(await axeViolations(page)).toEqual([])

    // The other level, with the engine kept: smaller still.
    await page.getByRole('button', { name: 'Try another level' }).click()
    await page.getByText('Smallest', { exact: true }).click()
    await page.getByRole('button', { name: 'Compress', exact: true }).click()
    await expect(download).toBeVisible({ timeout: 60_000 })
    const smallest = await fetchFile(
      page,
      (await download.getAttribute('href'))!,
    )
    expect(smallest.length).toBeLessThan(bytes.length)
    expect(fetched.filter((url) => url.endsWith('/pyodide.js'))).toHaveLength(1)

    // A photo Recommended can't shrink (180 dpi, saved at low quality
    // already), but Smallest can: straight on with "Try Smallest".
    await page.getByRole('button', { name: 'Compress other PDFs' }).click()
    await page
      .locator('input[type=file]')
      .setInputFiles([
        await makePdf('modest.pdf', { photo: await photoJpeg(page, 760, 0.5) }),
      ])
    await page.getByText('Recommended', { exact: true }).click()
    await page.getByRole('button', { name: 'Compress', exact: true }).click()
    await expect(
      page.getByText('Recommended couldn’t make it at least 5% smaller.', {
        exact: false,
      }),
    ).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Try Smallest' }).click()
    await expect(download).toHaveAttribute(
      'download',
      'modest-compressed.pdf',
      {
        timeout: 60_000,
      },
    )
    await page.getByRole('button', { name: 'Compress other PDFs' }).click()

    // Compressed again, it doesn't get smaller: no new file.
    await page.locator('input[type=file]').setInputFiles([
      {
        name: 'photo-compressed.pdf',
        mimeType: 'application/pdf',
        buffer: smallest,
      },
    ])
    await page.getByRole('button', { name: 'Compress', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Already about as small as it gets' }),
    ).toBeVisible({ timeout: 60_000 })
    await expect(
      page.getByText('Even Smallest couldn’t make it at least 5% smaller.', {
        exact: false,
      }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('list', { name: 'The PDFs' })
        .getByText('photo-compressed.pdf'),
    ).toBeVisible()
    // At Smallest already, so nothing more to try.
    await expect(
      page.getByRole('button', { name: 'Try Smallest' }),
    ).toHaveCount(0)
    expect(await axeViolations(page)).toEqual([])
    await expect(page.getByRole('link', { name: /^Download/ })).toHaveCount(0)

    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)
