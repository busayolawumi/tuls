import { describe, expect, it } from 'vitest'
import {
  cutEvery,
  groupsFor,
  partName,
  partsFor,
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
  it('names parts after their pages', () => {
    expect(partName('report.pdf', [0, 1, 2])).toBe('report-pages-1-3.pdf')
    expect(partName('report.pdf', [3])).toBe('report-page-4.pdf')
    expect(rangeLabel([0, 1, 2])).toBe('Pages 1–3')
    expect(rangeLabel([3])).toBe('Page 4')
  })

  it('lists every part with its name and pages', () => {
    expect(partsFor('Scan.PDF', 3, new Set([0]))).toEqual([
      { name: 'Scan-page-1.pdf', pages: [0] },
      { name: 'Scan-pages-2-3.pdf', pages: [1, 2] },
    ])
  })

  it('names the ZIP after the PDF, and counts parts', () => {
    expect(zipName('report.pdf')).toBe('report-split.zip')
    expect(partsLabel(1)).toBe('1 part')
    expect(partsLabel(3)).toBe('3 parts')
  })
})
