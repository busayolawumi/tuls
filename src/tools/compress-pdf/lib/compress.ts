import type { CompressLevel } from '../../../engines/pymupdf/worker'
import { formatSize } from '../../../lib/format'

// What Compress PDF decides and says: the level, remembered, whether a
// smaller copy is worth having, and how much smaller it is.

export const MAX_FILES = 20

export const LEVELS: [CompressLevel, string][] = [
  ['recommended', 'Recommended'],
  ['smallest', 'Smallest'],
]

/** A line under the choice, about what each level does to pictures. */
export const LEVEL_NOTES: Record<CompressLevel, string> = {
  recommended: 'Looks the same on screen and prints well.',
  smallest: 'Fine on screen. Photos print softer.',
}

/**
 * A copy has to be at least this much smaller to be worth a new file: a
 * renamed copy of nearly the same size is no help.
 */
const WORTH_IT = 0.95

export function isWorthIt(before: number, after: number) {
  return after <= before * WORTH_IT
}

/** "74% smaller". Never 0% or 100%, which would mislead. */
export function smaller(before: number, after: number) {
  const percent = Math.round((1 - after / before) * 100)
  return `${Math.min(99, Math.max(1, percent))}% smaller`
}

/** "74% smaller, from 7 MB": a copy's line in a list (its size is shown). */
export function savingDetail(before: number, after: number) {
  return `${smaller(before, after)}, from ${formatSize(before)}`
}

/** "7 MB → 1.8 MB, 74% smaller". */
export function savingLine(before: number, after: number) {
  return `${formatSize(before)} → ${formatSize(after)}, ${smaller(before, after)}`
}

const KEY = 'tuls:compress-pdf:level'

/** The level chosen last time, or Recommended. */
export function loadLevel(
  storage: Pick<Storage, 'getItem'> | undefined,
): CompressLevel {
  try {
    return storage?.getItem(KEY) === 'smallest' ? 'smallest' : 'recommended'
  } catch {
    // Blocked storage.
    return 'recommended'
  }
}

/** Remembers the level for next time, if the browser allows. */
export function saveLevel(
  storage: Pick<Storage, 'setItem'> | undefined,
  level: CompressLevel,
) {
  try {
    storage?.setItem(KEY, level)
  } catch {
    // Not remembered, which is fine.
  }
}
