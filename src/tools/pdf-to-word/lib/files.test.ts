import { describe, expect, it } from 'vitest'
import {
  checkPdfFile,
  fromPages,
  hasText,
  leftOutPages,
  MAX_FILE_SIZE,
  pageRanges,
  scanNote,
  tooManyPages,
} from './files'

const file = (name: string, size: number, type = 'application/pdf') =>
  ({ name, size, type }) as File

describe('PDF to Word’s checks', () => {
  it('takes PDFs up to the size limit', () => {
    expect(checkPdfFile(file('a.pdf', 10))).toBeUndefined()
    // Some browsers give PDFs no type.
    expect(checkPdfFile(file('a.PDF', 10, ''))).toBeUndefined()
    expect(checkPdfFile(file('a.docx', 10, 'application/msword'))).toBe(
      'That isn’t a PDF.',
    )
    expect(checkPdfFile(file('a.pdf', 0))).toBe('That file is empty.')
    expect(checkPdfFile(file('a.pdf', MAX_FILE_SIZE + 1))).toMatch(
      /^That PDF is .* Each can be up to 100 MB\.$/,
    )
    expect(tooManyPages(301)).toBe(
      'It has 301 pages. Each PDF can have up to 300.',
    )
  })

  it('writes page numbers as ranges', () => {
    expect(pageRanges([4])).toBe('4')
    expect(pageRanges([2, 3])).toBe('2–3')
    expect(pageRanges([8, 1, 2, 3, 5, 7])).toBe('1–3, 5 and 7–8')
    expect(pageRanges([])).toBe('')
  })

  it('says which pages are scanned, and what that means', () => {
    expect(scanNote(3, [])).toBeUndefined()
    expect(scanNote(1, [1])).toBe(
      'It’s scanned, so its page is a picture. In Word it will stay a picture, not text you can edit.',
    )
    expect(scanNote(2, [1, 2])).toBe(
      'It’s scanned, so its pages are pictures. In Word they’ll stay pictures, not text you can edit.',
    )
    expect(scanNote(5, [3])).toBe(
      'Page 3 is scanned, so it will be a picture in Word, not text you can edit.',
    )
    expect(scanNote(5, [2, 3, 5])).toBe(
      'Pages 2–3 and 5 are scanned, so they’ll be pictures in Word, not text you can edit.',
    )
  })

  it('counts a page as text only if it has words', () => {
    expect(hasText([])).toBe(false)
    expect(hasText([{ str: ' ' }, { type: 'beginMarkedContent' }])).toBe(false)
    expect(hasText([{ str: '' }, { str: 'Hello' }])).toBe(true)
  })

  it('names pages the converter couldn’t do', () => {
    expect(leftOutPages([12])).toBe(
      'Page 12 couldn’t be converted, so it’s left out of the Word file.',
    )
    expect(leftOutPages([3, 4, 9])).toBe(
      'Pages 3–4 and 9 couldn’t be converted, so they’re left out of the Word file.',
    )
  })

  it('describes what a Word file came from', () => {
    expect(fromPages(12)).toBe('From a 12-page PDF')
  })
})
