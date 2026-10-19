import { runQpdf, type QpdfResult } from '../qpdf/qpdf'
import { PdfError, type PdfErrorKind } from './errors'
import { mentionsEncryption } from './names'

// Adding and removing PDF passwords, and opening PDFs that are locked only
// against changes, all with qpdf (engines/qpdf). pdf-lib's own encryption
// leaves some text unencrypted, and its decryption garbles text with
// brackets or backslashes in PDFs locked by some apps (Apple's among them):
// CLAUDE.md, "Protect PDF and Unlock PDF: findings".

/** Why qpdf failed, from what it said. */
export function qpdfErrorKind({ output }: Pick<QpdfResult, 'output'>) {
  let kind: PdfErrorKind = 'unknown'
  if (/invalid password/i.test(output)) kind = 'password'
  else if (/out of memory|OOM|allocation failed/i.test(output)) kind = 'memory'
  else if (/not a PDF|PDF header|trailer|xref|damaged|EOF/i.test(output)) {
    kind = 'unreadable'
  }
  return kind
}

/** qpdf's file, or the error it ended with. Warnings (3) still make a file. */
function madeFile(result: QpdfResult, name: string) {
  const file = result.files[name]
  if ((result.code === 0 || result.code === 3) && file) return file
  throw new PdfError(qpdfErrorKind(result), result.output)
}

const hex = (text: string) =>
  Array.from(new TextEncoder().encode(text), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

/**
 * Gives a PDF a password, with AES-256. Whoever has it can do anything with
 * the PDF (print, copy, change), so there's no second password. Its details
 * (title, author, dates, XMP) are removed; forms, links and bookmarks stay.
 *
 * Keyboards type accented letters composed (é), but Apple's readers break
 * them up (e + ´) before checking. So the password goes in both ways: as
 * the user password, composed, and as the owner password, broken up. Each
 * opens the PDF fully.
 */
export async function protectPdf(file: ArrayBuffer, password: string) {
  const result = await runQpdf(
    [
      '--password-mode=hex-bytes',
      '/in.pdf',
      '--remove-info',
      '--remove-metadata',
      '--encrypt',
      `--user-password=${hex(password.normalize('NFC'))}`,
      `--owner-password=${hex(password.normalize('NFD'))}`,
      '--bits=256',
      '--',
      '/out.pdf',
    ],
    { 'in.pdf': new Uint8Array(file) },
    ['out.pdf'],
  )
  return madeFile(result, 'out.pdf')
}

/**
 * Takes the password off a PDF, given it, and removes its details. The
 * password is tried as typed, then composed and broken up (see protectPdf),
 * in case the app that set it stored it the other way. A wrong one gives a
 * 'password' PdfError.
 */
export async function unlockPdf(file: ArrayBuffer, password: string) {
  const input = new Uint8Array(file)
  const tries = new Set([
    password,
    password.normalize('NFC'),
    password.normalize('NFD'),
  ])
  let last: QpdfResult | undefined
  for (const attempt of tries) {
    last = await runQpdf(
      [
        `--password=${attempt}`,
        '/in.pdf',
        '--decrypt',
        '--remove-info',
        '--remove-metadata',
        '/out.pdf',
      ],
      { 'in.pdf': input },
      ['out.pdf'],
    )
    if (qpdfErrorKind(last) !== 'password') break
  }
  return madeFile(last!, 'out.pdf')
}

/**
 * A copy of a PDF that pdf-lib can change safely. PDFs locked only against
 * changes (many bank statements) open without a password, so qpdf unlocks
 * them with an empty one; what Tuls makes from them has no lock (decided in
 * Stage 2). PDFs that need a password give a 'password' PdfError. Anything
 * else qpdf can't do is left to pdf-lib, as before.
 */
export async function plainCopy(file: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(file)
  if (!mentionsEncryption(bytes)) return file
  const result = await runQpdf(
    ['--password=', '/in.pdf', '--decrypt', '/out.pdf'],
    { 'in.pdf': bytes },
    ['out.pdf'],
  )
  const kind = qpdfErrorKind(result)
  if (kind === 'password') throw new PdfError(kind, result.output)
  const out = result.files['out.pdf']
  if ((result.code !== 0 && result.code !== 3) || !out) return file
  return new Uint8Array(out).buffer
}
