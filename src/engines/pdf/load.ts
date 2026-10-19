import { PDFDocument } from '@cantoo/pdf-lib'
import { plainCopy } from './passwords'

/**
 * Opens a PDF for changing. Some PDFs, many bank statements among them, are
 * locked against changes but open without a password. pdf.js shows them
 * like any other PDF, so they're unlocked here too (by qpdf, with an empty
 * password: see passwords.ts), and what Tuls makes from them has no lock.
 * PDFs that need a password to open still fail, with a password error.
 */
export async function loadPdf(file: ArrayBuffer) {
  return PDFDocument.load(await plainCopy(file), { password: '' })
}
