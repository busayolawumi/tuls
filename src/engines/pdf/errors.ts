/** Why a PDF couldn't be opened or made, so a tool can say something useful. */
export type PdfErrorKind = 'password' | 'unreadable' | 'memory' | 'unknown'

export class PdfError extends Error {
  kind: PdfErrorKind
  constructor(kind: PdfErrorKind, cause?: unknown) {
    super(`PDF problem (${kind})`, { cause })
    this.kind = kind
  }
}

// Matched against the names and messages of pdf.js and pdf-lib errors, and
// of Tuls's own JPEG reader (lib/jpeg.ts).
const PASSWORD = /PasswordException|EncryptedPDFError|is encrypted|password/i
const UNREADABLE =
  /InvalidPDFException|Invalid PDF|Failed to parse|No PDF header|Expected instance of|MissingPDFHeader|Unexpected (token|end)|bad XRef|Not a JPEG|Damaged JPEG/i
const MEMORY =
  /out of memory|Array buffer allocation failed|Invalid array length|RangeError: Maximum/i

export function pdfErrorKind(error: unknown): PdfErrorKind {
  if (error instanceof PdfError) return error.kind
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (PASSWORD.test(text)) return 'password'
  if (MEMORY.test(text)) return 'memory'
  if (UNREADABLE.test(text)) return 'unreadable'
  return 'unknown'
}

/** A plain sentence for each kind, for a file that couldn't be opened. */
export const PDF_ERROR_MESSAGES: Record<PdfErrorKind, string> = {
  password:
    'This PDF has a password. Tuls can’t open password-protected PDFs yet.',
  unreadable: 'This file isn’t a PDF, or it’s damaged.',
  memory: 'This PDF is too big for your device to open here.',
  unknown: 'Something went wrong opening this PDF.',
}
