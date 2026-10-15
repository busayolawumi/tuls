import { describe, expect, it } from 'vitest'
import {
  keptLabel,
  movePage,
  planFor,
  startingPages,
  toggleDeleted,
  turnAll,
  turnPage,
} from './pages'

const order = (pages: { index: number }[]) => pages.map((page) => page.index)

describe('startingPages', () => {
  it('has every page in order, unturned and kept', () => {
    expect(startingPages(3)).toEqual([
      { id: '0', index: 0, turn: 0, deleted: false },
      { id: '1', index: 1, turn: 0, deleted: false },
      { id: '2', index: 2, turn: 0, deleted: false },
    ])
  })
})

describe('turning', () => {
  it('turns one page a quarter at a time, back round to upright', () => {
    let pages = startingPages(2)
    pages = turnPage(pages, '1')
    expect(pages.map((page) => page.turn)).toEqual([0, 90])
    for (let i = 0; i < 3; i++) pages = turnPage(pages, '1')
    expect(pages[1].turn).toBe(0)
  })

  it('turns every page at once', () => {
    const pages = turnAll(turnPage(startingPages(2), '0'))
    expect(pages.map((page) => page.turn)).toEqual([180, 90])
  })
})

describe('movePage', () => {
  it('moves a page to where another one is', () => {
    expect(order(movePage(startingPages(4), '3', '0'))).toEqual([3, 0, 1, 2])
    expect(order(movePage(startingPages(4), '0', '2'))).toEqual([1, 2, 0, 3])
  })

  it('leaves the order alone for unknown pages or no move', () => {
    const pages = startingPages(3)
    expect(movePage(pages, '1', '1')).toBe(pages)
    expect(movePage(pages, '1', 'nope')).toBe(pages)
  })
})

describe('planFor', () => {
  it('lists the kept pages, in order, with their turns', () => {
    let pages = movePage(startingPages(4), '3', '0')
    pages = toggleDeleted(pages, '1')
    pages = turnPage(pages, '2')
    expect(planFor(pages)).toEqual([
      { index: 3, turn: 0 },
      { index: 0, turn: 0 },
      { index: 2, turn: 90 },
    ])
  })

  it('takes a deleted page back when it’s kept again', () => {
    const pages = toggleDeleted(toggleDeleted(startingPages(2), '0'), '0')
    expect(planFor(pages)).toHaveLength(2)
  })
})

describe('keptLabel', () => {
  it('counts the pages, and the kept ones once some are going', () => {
    expect(keptLabel(startingPages(12))).toBe('12 pages')
    expect(keptLabel(toggleDeleted(startingPages(12), '4'))).toBe(
      'Keeping 11 of 12 pages',
    )
  })
})
