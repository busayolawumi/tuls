import { describe, expect, it } from 'vitest'
import { mergedFileName, move } from './files'

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
