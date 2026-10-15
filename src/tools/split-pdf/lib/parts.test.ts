import { describe, expect, it } from 'vitest'
import {
  baseName,
  cutEvery,
  groupsFor,
  partName,
  partsLabel,
  rangeLabel,
  toggleCut,
  zipName,
} from './parts'

describe('toggleCut', () => {
  it('adds a split, and takes it away again', () => {
    const once = toggleCut(new Set(), 2)
    expect([...once]).toEqual([2])
    expect([...toggleCut(once, 2)]).toEqual([])
  })
})

describe('cutEvery', () => {
  it('splits after every n pages, never after the last', () => {
    expect([...cutEvery(5, 1)]).toEqual([0, 1, 2, 3])
    expect([...cutEvery(5, 2)]).toEqual([1, 3])
    expect([...cutEvery(6, 3)]).toEqual([2])
  })

  it('makes no splits when n covers every page, and treats nonsense as 1', () => {
    expect([...cutEvery(3, 3)]).toEqual([])
    expect([...cutEvery(3, 0)]).toEqual([0, 1])
    expect([...cutEvery(3, 1.7)]).toEqual([0, 1])
  })
})

describe('groupsFor', () => {
  it('groups the pages between the splits', () => {
    expect(groupsFor(5, new Set([1, 2]))).toEqual([[0, 1], [2], [3, 4]])
  })

  it('is one group with no splits', () => {
    expect(groupsFor(3, new Set())).toEqual([[0, 1, 2]])
  })
})

describe('names and labels', () => {
  it('starts with the PDF’s own name', () => {
    expect(baseName('report.pdf')).toBe('report')
    expect(baseName('Scan.PDF')).toBe('Scan')
    expect(baseName('.pdf')).toBe('document')
  })

  it('names parts after their pages', () => {
    expect(partName('report', [0, 1, 2])).toBe('report-pages-1-3.pdf')
    expect(partName('Statements', [3])).toBe('Statements-page-4.pdf')
    expect(rangeLabel([0, 1, 2])).toBe('Pages 1–3')
    expect(rangeLabel([3])).toBe('Page 4')
  })

  it('names the ZIP, and counts parts', () => {
    expect(zipName('Statements')).toBe('Statements.zip')
    expect(partsLabel(1)).toBe('1 part')
    expect(partsLabel(3)).toBe('3 parts')
  })
})
