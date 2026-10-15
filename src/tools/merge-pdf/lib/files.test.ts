import { describe, expect, it } from 'vitest'
import {
  checkPdf,
  MAX_FILE_SIZE,
  mergedFileName,
  move,
  pagesLabel,
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

describe('mergedFileName', () => {
  it('is the first PDF’s name plus -merged', () => {
    expect(mergedFileName('report.pdf')).toBe('report-merged.pdf')
    expect(mergedFileName('Scan 2.PDF')).toBe('Scan 2-merged.pdf')
    expect(mergedFileName('.pdf')).toBe('document-merged.pdf')
  })
})

describe('move', () => {
  it('moves an item and keeps the rest in order', () => {
    expect(move(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('ignores moves past either end', () => {
    const list = ['a', 'b']
    expect(move(list, 0, -1)).toBe(list)
    expect(move(list, 1, 2)).toBe(list)
  })
})

describe('pagesLabel', () => {
  it('counts pages in words', () => {
    expect(pagesLabel(1)).toBe('1 page')
    expect(pagesLabel(12)).toBe('12 pages')
  })
})
