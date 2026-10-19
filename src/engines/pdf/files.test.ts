import { describe, expect, it } from 'vitest'
import {
  checkPdf,
  MAX_FILE_SIZE,
  outputName,
  outputNames,
  pagesLabel,
  pdfBase,
} from './files'

// checkPdf only reads the name, type and size.
const file = (name: string, type: string, size = 100_000) =>
  ({ name, type, size }) as File

describe('checkPdf', () => {
  it('accepts PDFs, by type or by name', () => {
    expect(checkPdf(file('report.pdf', 'application/pdf'))).toBeUndefined()
    expect(checkPdf(file('SCAN.PDF', ''))).toBeUndefined()
  })

  it('turns down other files', () => {
    expect(checkPdf(file('notes.txt', 'text/plain'))).toBe('That isn’t a PDF.')
  })

  it('turns down PDFs that are too big', () => {
    expect(
      checkPdf(file('big.pdf', 'application/pdf', MAX_FILE_SIZE + 1)),
    ).toBe('That PDF is 200 MB. Each PDF can be up to 200 MB.')
  })
})

describe('pdfBase', () => {
  it('is the PDF’s name without .pdf', () => {
    expect(pdfBase('report.pdf')).toBe('report')
    expect(pdfBase('Scan.PDF')).toBe('Scan')
    expect(pdfBase('.pdf')).toBe('document')
  })
})

describe('outputName', () => {
  it('is the original’s name plus what was done', () => {
    expect(outputName('report.pdf', 'merged')).toBe('report-merged.pdf')
    expect(outputName('Scan 2.PDF', 'organised')).toBe('Scan 2-organised.pdf')
    expect(outputName('.pdf', 'merged')).toBe('document-merged.pdf')
  })
})

describe('outputNames', () => {
  it('adds the suffix, and numbers same names', () => {
    expect(
      outputNames(['report.pdf', 'Report.PDF', 'notes.pdf'], 'protected'),
    ).toEqual([
      'report-protected.pdf',
      'Report-protected (2).pdf',
      'notes-protected.pdf',
    ])
  })
})

describe('pagesLabel', () => {
  it('counts pages in words', () => {
    expect(pagesLabel(1)).toBe('1 page')
    expect(pagesLabel(12)).toBe('12 pages')
  })
})
