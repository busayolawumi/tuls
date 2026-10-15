import { moveTo } from '../../../components/sortable/moveTo'
import { pagesLabel } from '../../../engines/pdf/files'
import type { PagePlan } from '../../../engines/pdf/organise'

/**
 * A page as the tool shows it: which original page it is (from 0), how far
 * it's turned clockwise, and whether it's going.
 */
export type Page = { id: string; index: number; turn: number; deleted: boolean }

// A long grid of pages is slow to drag around, especially on phones.
export const MAX_PAGES = 500

/** Every page, in its original order, unturned. */
export function startingPages(count: number): Page[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    index,
    turn: 0,
    deleted: false,
  }))
}

const quarterTurn = (turn: number) => (turn + 90) % 360

/** Turns one page a quarter clockwise. */
export function turnPage(pages: Page[], id: string): Page[] {
  return pages.map((page) =>
    page.id === id ? { ...page, turn: quarterTurn(page.turn) } : page,
  )
}

/** Turns every page a quarter clockwise. */
export function turnAll(pages: Page[]): Page[] {
  return pages.map((page) => ({ ...page, turn: quarterTurn(page.turn) }))
}

/** Marks a page to be deleted, or keeps it again. */
export function toggleDeleted(pages: Page[], id: string): Page[] {
  return pages.map((page) =>
    page.id === id ? { ...page, deleted: !page.deleted } : page,
  )
}

/** Moves page `id` to where page `to` is now. */
export function movePage(pages: Page[], id: string, to: string): Page[] {
  return moveTo(pages, id, to)
}

/** What the new PDF is made of: the kept pages, in order, with their turns. */
export function planFor(pages: Page[]): PagePlan[] {
  return pages
    .filter((page) => !page.deleted)
    .map(({ index, turn }) => ({ index, turn }))
}

/** "12 pages", or "Keeping 10 of 12 pages" once some are to be deleted. */
export function keptLabel(pages: Page[]) {
  const kept = pages.filter((page) => !page.deleted).length
  if (kept === pages.length) return pagesLabel(pages.length)
  return `Keeping ${kept} of ${pagesLabel(pages.length)}`
}
