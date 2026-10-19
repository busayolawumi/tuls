import { readFileSync } from 'node:fs'
import { PDFDocument, PDFName, PDFRef, PDFString } from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { runQpdf } from '../qpdf/qpdf'
import { PdfError } from './errors'
import { mergePdfs } from './merge'
import { organisePdf } from './organise'
import { isSigned, mentionsEncryption } from './names'
import { plainCopy, protectPdf, qpdfErrorKind, unlockPdf } from './passwords'
import { splitPdf } from './split'

// The real qpdf (vitest.setup.ts says where), and pdf.js reading back what
// it makes, as a reader would.

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

/**
 * A page saying "Secret plans", with a title and author, and two comments
 * that pdf-lib's own encryption would leave readable: one written into the
 * page itself, and one stored with generation number 1.
 */
async function secretPdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([300, 300])
  page.drawText('Secret plans', { x: 20, y: 150 })
  doc.setTitle('Salary review')
  doc.setAuthor('Ada Example')
  const { context } = doc
  const inline = context.obj({
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [10, 10, 30, 30],
    Contents: PDFString.of('SECRET-INLINE-COMMENT'),
  })
  const later = PDFRef.of(context.largestObjectNumber + 1, 1)
  context.assign(
    later,
    context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [40, 10, 60, 30],
      Contents: PDFString.of('SECRET-LATER-COMMENT'),
    }),
  )
  context.largestObjectNumber += 1
  page.node.set(PDFName.of('Annots'), context.obj([inline, later]))
  // No object streams, so the comments sit in the file as written.
  return buffer(await doc.save({ useObjectStreams: false }))
}

/** What pdf.js makes of a PDF: its text and details, or why it can't open it. */
async function read(bytes: Uint8Array, password?: string) {
  const task = getDocument({ data: bytes.slice(), password, verbosity: 0 })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const text = (await page.getTextContent()).items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    const annotations = await page.getAnnotations()
    const { info, metadata } = await doc.getMetadata()
    return {
      text,
      annotations,
      info: info as Record<string, unknown>,
      metadata,
    }
  } catch (e) {
    return { error: (e as { code?: number }).code }
  } finally {
    await task.destroy()
  }
}

// pdf.js's PasswordException codes.
const NEEDS_PASSWORD = 1
const WRONG_PASSWORD = 2

// Needs a password to open ("user"), with a second one ("owner").
const NEEDS_A_PASSWORD = ['--encrypt', 'user', 'owner', '256', '--']

/** A PDF locked by qpdf itself, with the given qpdf encryption options. */
async function lockedByQpdf(options: string[]) {
  const { files } = await runQpdf(
    ['/in.pdf', ...options, '/out.pdf'],
    { 'in.pdf': new Uint8Array(await secretPdf()) },
    ['out.pdf'],
  )
  return buffer(files['out.pdf']!)
}

describe('protectPdf', () => {
  it('needs the password, and keeps the page', async () => {
    const locked = await protectPdf(await secretPdf(), 'correct horse 42')
    expect(await read(locked)).toEqual({ error: NEEDS_PASSWORD })
    expect(await read(locked, 'wrong')).toEqual({ error: WRONG_PASSWORD })
    const opened = await read(locked, 'correct horse 42')
    expect(opened.text).toBe('Secret plans')
    expect(opened.annotations?.map((a) => a.contentsObj?.str)).toEqual([
      'SECRET-INLINE-COMMENT',
      'SECRET-LATER-COMMENT',
    ])
  })

  it('leaves nothing readable without the password', async () => {
    const locked = latin1(await protectPdf(await secretPdf(), 'pw'))
    for (const text of ['Secret plans', 'SECRET', 'Salary review']) {
      expect(locked).not.toContain(text)
    }
  })

  it('removes the details', async () => {
    const opened = await read(await protectPdf(await secretPdf(), 'pw'), 'pw')
    expect(opened.info?.Title).toBeUndefined()
    expect(opened.info?.Author).toBeUndefined()
    expect(opened.metadata).toBeNull()
  })

  it('uses AES-256 and allows everything to whoever has the password', async () => {
    const locked = await protectPdf(await secretPdf(), 'pw')
    const { output } = await runQpdf(
      ['--password=pw', '--show-encryption', '/f.pdf'],
      { 'f.pdf': locked },
    )
    expect(output).toContain('R = 6')
    expect(output).toContain('file encryption method: AESv3')
    expect(output).toContain('modify anything: allowed')
    expect(output).toContain('print high resolution: allowed')
    expect(output).not.toContain('not allowed')
  })

  it('opens with accented letters typed composed or broken up', async () => {
    const password = 'Ọlá Àdé'
    const locked = await protectPdf(await secretPdf(), password)
    expect((await read(locked, password.normalize('NFC'))).text).toBe(
      'Secret plans',
    )
    // The broken-up form is how Apple's readers send it.
    for (const typed of [
      password.normalize('NFC'),
      password.normalize('NFD'),
    ]) {
      const unlocked = await unlockPdf(buffer(locked), typed)
      expect((await read(unlocked)).text).toBe('Secret plans')
    }
  })

  it('says when the PDF already has a password', async () => {
    const locked = await protectPdf(await secretPdf(), 'first')
    const error = await protectPdf(buffer(locked), 'second').catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('password')
  })

  it('says when the file isn’t a PDF', async () => {
    const junk = new TextEncoder().encode('not a pdf at all').buffer
    const error = await protectPdf(junk, 'pw').catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('unreadable')
  })
})

describe('unlockPdf', () => {
  const kinds: [string, string[]][] = [
    ['AES-256', NEEDS_A_PASSWORD],
    ['AES-128', ['--encrypt', 'user', 'owner', '128', '--use-aes=y', '--']],
    [
      'RC4-128',
      ['--allow-weak-crypto', '--encrypt', 'user', 'owner', '128', '--'],
    ],
    [
      'RC4-40',
      ['--allow-weak-crypto', '--encrypt', 'user', 'owner', '40', '--'],
    ],
  ]

  for (const [kind, options] of kinds) {
    it(`takes the password off ${kind}, and removes the details`, async () => {
      const locked = await lockedByQpdf(options)
      for (const password of ['user', 'owner']) {
        const unlocked = await unlockPdf(locked, password)
        expect(mentionsEncryption(unlocked)).toBe(false)
        const opened = await read(unlocked)
        expect(opened.text).toBe('Secret plans')
        expect(opened.info?.Title).toBeUndefined()
      }
    })
  }

  it('says when the password is wrong', async () => {
    const locked = await lockedByQpdf(NEEDS_A_PASSWORD)
    const error = await unlockPdf(locked, 'nope').catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('password')
  })
})

describe('names', () => {
  it('finds /Encrypt, but not /EncryptMetadata', async () => {
    const plain = new Uint8Array(await secretPdf())
    expect(mentionsEncryption(plain)).toBe(false)
    expect(
      mentionsEncryption(new Uint8Array(await lockedByQpdf(NEEDS_A_PASSWORD))),
    ).toBe(true)
    const text = (s: string) => new TextEncoder().encode(s)
    expect(mentionsEncryption(text('<< /EncryptMetadata false >>'))).toBe(false)
    expect(mentionsEncryption(text('trailer << /Encrypt 5 0 R >>'))).toBe(true)
    expect(mentionsEncryption(text('/Encrypt'))).toBe(true)
  })

  it('finds signatures', () => {
    const text = (s: string) => new TextEncoder().encode(s)
    expect(isSigned(text('<< /ByteRange [0 840 960 240] >>'))).toBe(true)
    expect(isSigned(text('<< /Type /Sig >>'))).toBe(false)
  })
})

describe('plainCopy', () => {
  it('leaves PDFs without a lock as they are', async () => {
    const plain = await secretPdf()
    expect(await plainCopy(plain)).toBe(plain)
  })

  it('takes off a lock against changes', async () => {
    const locked = await lockedByQpdf([
      '--encrypt',
      '',
      'owner',
      '256',
      '--modify=none',
      '--',
    ])
    const copy = new Uint8Array(await plainCopy(locked))
    expect(mentionsEncryption(copy)).toBe(false)
    expect((await read(copy)).text).toBe('Secret plans')
  })

  it('says when a PDF needs a password', async () => {
    const locked = await lockedByQpdf(NEEDS_A_PASSWORD)
    const error = await plainCopy(locked).catch((e) => e)
    expect(error).toBeInstanceOf(PdfError)
    expect(error.kind).toBe('password')
  })
})

describe('PDFs locked against changes by Apple', () => {
  // See fixtures/README.md. pdf-lib alone made these unreadable.
  const apple = () =>
    buffer(
      readFileSync(
        new URL('./fixtures/change-locked-by-apple.pdf', import.meta.url),
      ),
    )

  async function check(bytes: Uint8Array) {
    const opened = await read(bytes)
    expect(opened.error).toBeUndefined()
    expect(opened.text).toContain('Statement')
    // The form is drawn into the page, answer and all.
    expect(opened.text).toContain('C:\\Users\\Ada (home')
    const link = opened.annotations?.find((a) => a.subtype === 'Link')
    expect(link?.url ?? link?.unsafeUrl).toBe('https://example.com/a)b')
  }

  it('merge', async () => check(await mergePdfs([apple()])))
  it('organise', async () =>
    check(await organisePdf(apple(), [{ index: 0, turn: 0 }])))
  it('split', async () => {
    const [part] = await splitPdf(apple(), [[0]])
    await check(part)
  })
})

describe('qpdfErrorKind', () => {
  it('sorts what qpdf says', () => {
    expect(qpdfErrorKind({ output: 'x.pdf: invalid password' })).toBe(
      'password',
    )
    expect(
      qpdfErrorKind({
        output: 'x.pdf: not a PDF file (can’t find PDF header)',
      }),
    ).toBe('unreadable')
    expect(qpdfErrorKind({ output: 'something odd' })).toBe('unknown')
  })
})
