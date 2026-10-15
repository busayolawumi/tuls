import { describe, expect, it } from 'vitest'
import { PdfError, pdfErrorKind } from './errors'

const named = (name: string, message: string) =>
  Object.assign(new Error(message), { name })

describe('pdfErrorKind', () => {
  it('spots password-protected PDFs', () => {
    expect(pdfErrorKind(named('PasswordException', 'No password given'))).toBe(
      'password',
    )
    expect(
      pdfErrorKind(named('EncryptedPDFError', 'Input document is encrypted')),
    ).toBe('password')
  })

  it('spots files that aren’t PDFs or are damaged', () => {
    expect(
      pdfErrorKind(named('InvalidPDFException', 'Invalid PDF structure.')),
    ).toBe('unreadable')
    expect(pdfErrorKind(new Error('Failed to parse PDF document'))).toBe(
      'unreadable',
    )
  })

  it('spots running out of memory', () => {
    expect(pdfErrorKind(new RangeError('Array buffer allocation failed'))).toBe(
      'memory',
    )
  })

  it('keeps the kind of a PdfError, and calls anything else unknown', () => {
    expect(pdfErrorKind(new PdfError('password'))).toBe('password')
    expect(pdfErrorKind(new Error('something odd'))).toBe('unknown')
  })
})
