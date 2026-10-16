import { describe, expect, it } from 'vitest'
import { OFFICE_ERROR_MESSAGES, OfficeError, officeErrorKind } from './errors'
import { extensionOf } from './files'

describe('officeErrorKind', () => {
  it('sorts the converter’s errors into plain kinds', () => {
    expect(officeErrorKind(new Error('Document is password protected'))).toBe(
      'password',
    )
    expect(officeErrorKind('Failed to load document')).toBe('unreadable')
    expect(officeErrorKind('General input/output error')).toBe('unreadable')
    expect(officeErrorKind('Aborted(OOM)')).toBe('memory')
    expect(
      officeErrorKind(new RangeError('Array buffer allocation failed')),
    ).toBe('memory')
    expect(
      officeErrorKind('Failed to initialize WASM module: Network Error'),
    ).toBe('network')
    expect(officeErrorKind(new TypeError('Failed to fetch'))).toBe('network')
    expect(officeErrorKind('something else')).toBe('unknown')
  })

  it('keeps the kind of its own errors', () => {
    expect(officeErrorKind(new OfficeError('stuck'))).toBe('stuck')
  })

  it('has a sentence for every kind', () => {
    for (const message of Object.values(OFFICE_ERROR_MESSAGES)) {
      expect(message).toMatch(/^[A-Z].*\.$/)
    }
  })
})

describe('extensionOf', () => {
  it('reads the extension LibreOffice goes by', () => {
    expect(extensionOf('Report.DOCX')).toBe('docx')
    expect(extensionOf('notes.v2.odt')).toBe('odt')
    expect(extensionOf('README')).toBe('')
  })
})
