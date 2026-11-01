import { createRequire } from 'node:module'
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { strToU8, zipSync } from 'fflate'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const require = createRequire(import.meta.url)
const { version } = require('@matbee/libreoffice-converter/package.json') as {
  version: string
}

// Test documents are made on the spot: the smallest .docx Word and
// LibreOffice accept, with a paragraph per page. In its properties, a title
// and an author; with `review`, a tracked deletion and insertion, and a
// reviewer's comment, on the first page. Only the final text may reach the
// PDF.
const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const REVIEW =
  '<w:del w:id="1" w:author="Editor Cee" w:date="2026-10-16T10:00:00Z"><w:r><w:delText>DeletedSecret</w:delText></w:r></w:del>' +
  '<w:ins w:id="2" w:author="Editor Cee" w:date="2026-10-16T10:00:00Z"><w:r><w:t xml:space="preserve"> and added</w:t></w:r></w:ins>' +
  '<w:commentRangeStart w:id="0"/><w:r><w:t xml:space="preserve"> words</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>'

function makeDocx(name: string, pages: string[], review = false) {
  const body = pages
    .map(
      (text, i) =>
        `${i ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''}<w:p><w:r><w:t>${text}</w:t></w:r>${review && i === 0 ? REVIEW : ''}</w:p>`,
    )
    .join('')
  const files: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>`,
    'word/comments.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments ${W}><w:comment w:id="0" w:author="Reviewer Bee" w:date="2026-10-16T10:00:00Z"><w:p><w:r><w:t>CommentSecret</w:t></w:r></w:p></w:comment></w:comments>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}</w:body></w:document>`,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Salary review</dc:title><dc:creator>Ada Example</dc:creator><cp:lastModifiedBy>Ada Example</cp:lastModifiedBy></cp:coreProperties>`,
  }
  const zip = zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
    ),
  )
  return {
    name,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(zip),
  }
}

// A document with two things LibreOffice gets wrong on its own, which Tuls
// fixes: a bullet in Word's default Symbol font, and a heading underlined to
// the margin with trailing spaces, under Word's "underline trailing spaces"
// setting (CLAUDE.md, Stage 3).
function makeWordishDocx(name: string) {
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`,
    'word/settings.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:defaultTabStop w:val="720"/><w:compat><w:ulTrailSpace/></w:compat></w:settings>`,
    'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
    'word/numbering.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\uf0b7"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body><w:p><w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">SKILLS${' '.repeat(200)}</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>First</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  }
  return {
    name,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(files).map(([path, text]) => [path, strToU8(text)]),
        ),
      ),
    ),
  }
}

/** The names of the fonts a PDF embeds. */
function fontsIn(doc: PDFDocument) {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter(
      (object): object is PDFDict =>
        object instanceof PDFDict &&
        String(object.get(PDFName.of('Type'))) === '/Font',
    )
    .map((font) => String(font.get(PDFName.of('BaseFont'))))
}

// The page's warnings, attached to a failed test's report: the engine
// gives its reasons there when it can't start or convert.
let warnings: string[] = []
test.beforeEach(({ page }) => {
  warnings = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
})
// Playwright wants the fixtures argument, even when none are used.
// oxlint-disable-next-line no-empty-pattern
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && warnings.length) {
    await testInfo.attach('console warnings', { body: warnings.join('\n') })
    console.log(`Console warnings:\n${warnings.join('\n')}`)
  }
})

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

function watchRequests(page: Page, baseURL: string) {
  const elsewhere: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    const local = [baseURL, 'blob:', 'data:'].some((start) =>
      url.startsWith(start),
    )
    if (!local) elsewhere.push(url)
  })
  return elsewhere
}

async function axeViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return violations.map((v) => `${v.id}: ${v.help}`)
}

/** A downloaded file's bytes, fetched by the page from its blob: address. */
async function bytesOf(page: Page, href: string) {
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
    let text = ''
    for (const byte of bytes) text += String.fromCharCode(byte)
    return btoa(text)
  }, href)
  return Buffer.from(base64, 'base64')
}

/** Every object in a PDF, as text, to search for leftovers. */
function allText(doc: PDFDocument) {
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) =>
      object instanceof PDFRawStream
        ? Buffer.from(object.contents).toString('latin1')
        : object.toString(),
    )
    .join('\n')
}

/** Each page's text, and how many annotations (e.g. comments) it has. */
async function readPages(bytes: Uint8Array) {
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise
  const texts: string[] = []
  let annotations = 0
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    texts.push(
      content.items.map((item) => ('str' in item ? item.str : '')).join(''),
    )
    annotations += (await page.getAnnotations()).length
  }
  await doc.loadingTask.destroy()
  return { texts, annotations }
}

// As a string: this file is type-checked without the browser's types.
const isolated = (page: Page) =>
  page.evaluate<boolean>('self.crossOriginIsolated')

test(
  'converts Word documents to PDFs without sending anything elsewhere',
  { tag: '@engine' },
  async ({ page, baseURL }, testInfo) => {
    // The engine is a 77 MB download and a few seconds' start, so once is
    // enough.
    // It runs on its own after the other tests (the "engines" project in
    // playwright.config.ts), or in a config's "light" project.
    test.skip(
      !['engines', 'light'].includes(testInfo.project.name),
      'Runs once',
    )
    test.setTimeout(240_000)
    const errors = watchErrors(page)
    const elsewhere = watchRequests(page, baseURL!)

    // From the home page, the tool's page loads afresh, isolated.
    await page.goto('/')
    expect(await isolated(page)).toBe(false)
    await page.getByRole('link', { name: /^Word to PDF/ }).click()
    await expect(page).toHaveURL(/\/word-to-pdf$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Word to PDF',
    )
    expect(await isolated(page)).toBe(true)
    await expect(page.getByText(/MB download the first time/)).toBeVisible()

    await page
      .locator('input[type=file]')
      .setInputFiles(
        makeDocx(
          'salary review.docx',
          ['Hello from Tuls', 'Two', 'Three'],
          true,
        ),
      )
    await expect(page.getByRole('status')).toContainText(
      /Downloading the converter|Starting the converter|Converting/,
    )
    const download = page.getByRole('link', { name: 'Download PDF' })
    await expect(download).toBeVisible({ timeout: 180_000 })
    await expect(download).toHaveAttribute('download', 'salary review.pdf')
    await expect(page.getByText(/^3 pages · /)).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'The first page of salary review.pdf' }),
    ).toBeVisible()

    const bytes = await bytesOf(page, (await download.getAttribute('href'))!)
    // The document as final: the deletion gone, the insertion kept, and no
    // comments.
    const { texts, annotations } = await readPages(bytes)
    expect(texts[0]).toBe('Hello from Tuls and added words')
    expect(annotations).toBe(0)
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(pdf.getPageCount()).toBe(3)
    expect(pdf.getAuthor()).toBeUndefined()
    expect(pdf.getTitle()).toBeUndefined()
    expect(pdf.getProducer()).toBe('Tuls')
    for (const secret of ['Ada Example', 'Reviewer Bee', 'Editor Cee']) {
      expect(allText(pdf)).not.toContain(secret)
    }
    expect(allText(pdf)).not.toContain('Salary review')
    expect(await axeViolations(page)).toEqual([])

    // More at once, with the engine still running: two with the same name,
    // one that's cut off halfway, and one that isn't a Word document at all.
    await page
      .getByRole('button', { name: 'Convert more Word documents' })
      .click()
    await expect(page.getByText(/download the first time/)).toHaveCount(0)
    const whole = makeDocx('cut.docx', ['Lost'])
    await page.locator('input[type=file]').setInputFiles([
      makeWordishDocx('notes.docx'),
      { ...whole, buffer: whole.buffer.subarray(0, whole.buffer.length / 2) },
      {
        name: 'text.docx',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('this is not a Word document'),
      },
      makeDocx('Notes.docx', ['Second', 'page']),
    ])
    const list = page.getByRole('list', { name: 'The PDFs' })
    await expect(list.getByRole('listitem')).toHaveCount(2, {
      timeout: 120_000,
    })
    const problems = page.getByRole('alert')
    await expect(problems).toContainText('cut.docx: It couldn’t be opened.')
    await expect(problems).toContainText('text.docx: It couldn’t be opened.')
    await expect(
      page.getByRole('link', { name: 'Download notes.pdf' }),
    ).toBeVisible()
    const second = page.getByRole('link', { name: 'Download Notes (2).pdf' })
    const { texts: secondTexts } = await readPages(
      await bytesOf(page, (await second.getAttribute('href'))!),
    )
    expect(secondTexts).toEqual(['Second', 'page'])
    // Word's Symbol bullet is drawn with Tuls's Symbol font, not OpenSymbol,
    // and the heading came through the trailing-spaces fix.
    const notes = await PDFDocument.load(
      await bytesOf(
        page,
        (await page
          .getByRole('link', { name: 'Download notes.pdf' })
          .getAttribute('href'))!,
      ),
    )
    const fonts = fontsIn(notes)
    expect(fonts.some((font) => font.endsWith('+StandardSymbolsPS'))).toBe(true)
    expect(fonts.some((font) => font.includes('OpenSymbol'))).toBe(false)
    const { texts: notesTexts } = await readPages(
      await bytesOf(
        page,
        (await page
          .getByRole('link', { name: 'Download notes.pdf' })
          .getAttribute('href'))!,
      ),
    )
    expect(notesTexts[0]).toContain('SKILLS')
    expect(notesTexts[0]).toContain('First')
    await expect(page.getByText(/^2 PDFs · /)).toBeVisible()
    expect(await axeViolations(page)).toEqual([])

    expect(elsewhere).toEqual([])
    expect(errors).toEqual([])
  },
)

test('turns down files that aren’t Word documents', async ({ page }) => {
  await page.goto('/word-to-pdf')
  await page.locator('input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(page.getByRole('alert')).toHaveText(
    'That isn’t a Word document.',
  )
})

test('the page is isolated, and the engine has its own policy', async ({
  request,
}) => {
  const tool = (await request.get('/word-to-pdf')).headers()
  expect(tool['cross-origin-opener-policy']).toBe('same-origin')
  expect(tool['cross-origin-embedder-policy']).toBe('require-corp')
  expect(tool['content-security-policy']).not.toContain("'unsafe-eval'")

  const engine = (
    await request.head(`/engines/libreoffice-${version}/soffice.data.gz`)
  ).headers()
  expect(engine['content-security-policy']).toContain(
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  )
  expect(engine['cache-control']).toContain('immutable')
})

test('the tool has its own title and link preview', async ({ request }) => {
  const html = await (await request.get('/word-to-pdf')).text()
  expect(html).toContain('<title>Word to PDF · Tuls</title>')
  expect(html).toContain(
    '<meta property="og:url" content="https://tuls.bsyo.dev/word-to-pdf" />',
  )
})

test('no accessibility problems on the first screen', async ({ page }) => {
  await page.goto('/word-to-pdf')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Word to PDF',
  )
  expect(await axeViolations(page)).toEqual([])
})
