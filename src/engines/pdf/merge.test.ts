import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFForm,
  type PDFPage,
  StandardFonts,
  type SaveOptions,
} from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { PdfError } from './errors'
import { mergePdfs } from './merge'

/** A PDF with `count` blank pages of one size, made on the spot. */
async function makePdf(
  count: number,
  size: [number, number],
  setUp?: (doc: PDFDocument) => void,
  save?: SaveOptions,
) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < count; i++) doc.addPage(size)
  setUp?.(doc)
  const bytes = await doc.save(save)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

/** A one-page PDF with a form, filled in by `fill`. */
const makeForm = (
  fill: (form: PDFForm, page: PDFPage, doc: PDFDocument) => void,
  save?: SaveOptions,
) =>
  makePdf(
    1,
    [300, 400],
    (doc) => fill(doc.getForm(), doc.getPage(0), doc),
    save,
  )

const sizes = (doc: PDFDocument) =>
  doc.getPages().map((page) => {
    const { width, height } = page.getSize()
    return `${width}x${height}`
  })

/** The text pdf.js finds on the first page: what a viewer would show. */
async function firstPageText(bytes: Uint8Array) {
  const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise
  try {
    const { items } = await (await doc.getPage(1)).getTextContent()
    return items.map((item) => ('str' in item ? item.str : '')).join(' ')
  } finally {
    await doc.loadingTask.destroy()
  }
}

/** Form fields still on the pages, which would no longer work. */
async function widgetCount(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes)
  let count = 0
  for (const page of doc.getPages()) {
    const annots = page.node.Annots()
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = doc.context.lookupMaybe(annots!.get(i), PDFDict)
      if (annot?.get(PDFName.of('Subtype')) === PDFName.of('Widget')) count++
    }
  }
  return count
}

const place = { x: 20, y: 300, width: 200, height: 30 }

describe('mergePdfs', () => {
  it('puts every page in, in the order given', async () => {
    const a = await makePdf(2, [300, 400])
    const b = await makePdf(3, [500, 500])
    const merged = await PDFDocument.load(await mergePdfs([b, a]))
    expect(sizes(merged)).toEqual([
      '500x500',
      '500x500',
      '500x500',
      '300x400',
      '300x400',
    ])
  })

  it('leaves the originals’ details behind', async () => {
    const a = await makePdf(1, [300, 400], (doc) => {
      doc.setAuthor('Someone Private')
      doc.setTitle('Secret plans')
    })
    const b = await makePdf(1, [300, 400])
    // updateMetadata: false, or pdf-lib stamps its own name on it as it opens.
    const merged = await PDFDocument.load(await mergePdfs([a, b]), {
      updateMetadata: false,
    })
    expect(merged.getAuthor()).toBeUndefined()
    expect(merged.getTitle()).toBeUndefined()
    expect(merged.getProducer()).toBe('Tuls')
  })

  it('says when a file isn’t a PDF', async () => {
    const a = await makePdf(1, [300, 400])
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await mergePdfs([a, junk]).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })

  it('merges PDFs locked only against changes, and drops the lock', async () => {
    // Like many bank statements: they open without a password.
    const locked = await makePdf(2, [300, 400], (doc) =>
      doc.encrypt({
        userPassword: '',
        ownerPassword: 'owner',
        permissions: { modifying: false },
      }),
    )
    const merged = await mergePdfs([locked, await makePdf(1, [500, 500])])
    const doc = await PDFDocument.load(merged)
    expect(doc.isEncrypted).toBe(false)
    expect(sizes(doc)).toEqual(['300x400', '300x400', '500x500'])
  })

  it('says when a PDF has a password', async () => {
    const locked = await makePdf(1, [300, 400], (doc) =>
      doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' }),
    )
    const error = await mergePdfs([locked]).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('password')
  })
})

describe('mergePdfs with forms', () => {
  it('draws filled-in answers into the page', async () => {
    const filled = await makeForm((form, page) => {
      const name = form.createTextField('name')
      name.addToPage(page, place)
      name.setText('Ada Lovelace')
      const agree = form.createCheckBox('agree')
      agree.addToPage(page, { ...place, y: 250, width: 20, height: 20 })
      agree.check()
    })
    const merged = await mergePdfs([filled])
    expect(await firstPageText(merged)).toContain('Ada Lovelace')
    expect(await widgetCount(merged)).toBe(0)
  })

  it('draws answers that were saved without being drawn', async () => {
    const filled = await makeForm(
      (form, page) => {
        const name = form.createTextField('name')
        name.addToPage(page, place)
        name.setText('Ada Lovelace')
        // As some apps save it: the answer, but no look for it at all.
        for (const widget of name.acroField.getWidgets()) {
          widget.dict.delete(PDFName.of('AP'))
        }
      },
      { updateFieldAppearances: false },
    )
    expect(await firstPageText(await mergePdfs([filled]))).toContain(
      'Ada Lovelace',
    )
  })

  it('redraws answers when the PDF says its looks are out of date', async () => {
    const filled = await makeForm(
      (form, page) => {
        const name = form.createTextField('name')
        name.addToPage(page, place) // drawn while still empty
        name.setText('Ada Lovelace')
        form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True)
      },
      { updateFieldAppearances: false },
    )
    expect(await firstPageText(await mergePdfs([filled]))).toContain(
      'Ada Lovelace',
    )
  })

  it('keeps answers that are already drawn as they are', async () => {
    // Drawn in Courier, as the app that filled it chose. Redrawing would
    // switch it to Helvetica (and lose letters Helvetica lacks).
    const filled = await makeForm((form, page, doc) => {
      const name = form.createTextField('name')
      name.addToPage(page, place)
      name.setText('Ada Lovelace')
      name.updateAppearances(doc.embedStandardFont(StandardFonts.Courier))
    })
    const doc = await getDocument({ data: await mergePdfs([filled]) }).promise
    const { items, styles } = await (await doc.getPage(1)).getTextContent()
    const answer = items.find((item) => 'str' in item && item.str)
    expect(answer && 'fontName' in answer && styles[answer.fontName]).toEqual(
      expect.objectContaining({ fontFamily: 'monospace' }),
    )
    await doc.loadingTask.destroy()
  })

  it('draws undrawn answers in Helvetica, with ? for letters it lacks', async () => {
    const filled = await makeForm(
      (form, page) => {
        const name = form.createTextField('name')
        name.addToPage(page, place)
        name.setText('Ọlá')
        for (const widget of name.acroField.getWidgets()) {
          widget.dict.delete(PDFName.of('AP'))
        }
      },
      { updateFieldAppearances: false },
    )
    // Not ideal, but a visibly wrong letter beats a silently missing answer.
    // A Unicode font would fix it (see CLAUDE.md).
    expect(await firstPageText(await mergePdfs([filled]))).toContain('?lá')
  })

  it('leaves out buttons and hidden fields', async () => {
    const filled = await makeForm((form, page) => {
      form.createButton('print').addToPage('Print this form', page, place)
      const secret = form.createTextField('secret')
      secret.addToPage(page, { ...place, y: 250 })
      secret.setText('Hidden answer')
      for (const widget of secret.acroField.getWidgets()) widget.setFlags(2)
    })
    const text = await firstPageText(await mergePdfs([filled]))
    expect(text).not.toContain('Print this form')
    expect(text).not.toContain('Hidden answer')
  })
})
