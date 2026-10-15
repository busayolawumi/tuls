import { outputName } from '../../../engines/pdf/files'
import type { SplitPart } from '../../../engines/pdf/split'

// No dragging here, so a longer PDF is fine than in Organise PDF.
export const MAX_PAGES = 1000

/** Where to split: after these pages (numbered from 0). */
export type Cuts = ReadonlySet<number>

/** Splits after page `index`, or takes that split away. */
export function toggleCut(cuts: Cuts, index: number): Cuts {
  const next = new Set(cuts)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  return next
}

/** A split after every `n` pages of `count`. */
export function cutEvery(count: number, n: number): Cuts {
  const size = Math.max(1, Math.floor(n))
  const cuts = new Set<number>()
  for (let index = size - 1; index < count - 1; index += size) cuts.add(index)
  return cuts
}

/** The pages (numbered from 0) of each part the cuts make, in order. */
export function groupsFor(count: number, cuts: Cuts): number[][] {
  const groups: number[][] = []
  let group: number[] = []
  for (let index = 0; index < count; index++) {
    group.push(index)
    if (cuts.has(index) || index === count - 1) {
      groups.push(group)
      group = []
    }
  }
  return groups
}

const span = (pages: number[]) => [pages[0] + 1, pages[pages.length - 1] + 1]

/** "Pages 1–3", or "Page 4". */
export function rangeLabel(pages: number[]) {
  const [first, last] = span(pages)
  return first === last ? `Page ${first}` : `Pages ${first}–${last}`
}

/** A part's file name, e.g. report-pages-1-3.pdf or report-page-4.pdf. */
export function partName(original: string, pages: number[]) {
  const [first, last] = span(pages)
  return outputName(
    original,
    first === last ? `page-${first}` : `pages-${first}-${last}`,
  )
}

/** Every part: its file name and its pages. */
export function partsFor(original: string, count: number, cuts: Cuts) {
  return groupsFor(count, cuts).map((pages): SplitPart => ({
    name: partName(original, pages),
    pages,
  }))
}

/** The ZIP of every part, e.g. report-split.zip. */
export function zipName(original: string) {
  return outputName(original, 'split').replace(/\.pdf$/, '.zip')
}

/** "1 part", "3 parts". */
export function partsLabel(count: number) {
  return `${count} ${count === 1 ? 'part' : 'parts'}`
}
