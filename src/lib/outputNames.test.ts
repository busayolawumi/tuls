import { describe, expect, it } from 'vitest'
import { documentBase, outputNames } from './outputNames'

describe('naming converted files', () => {
  it('keeps the name, with the new extension, numbering repeats', () => {
    expect(documentBase('Report final.pdf')).toBe('Report final')
    expect(outputNames(['a.pdf', 'b.pdf'], 'docx')).toEqual([
      'a.docx',
      'b.docx',
    ])
    expect(outputNames(['CV.pdf', 'cv.PDF', 'other.pdf'], 'docx')).toEqual([
      'CV.docx',
      'cv (2).docx',
      'other.docx',
    ])
  })
})
