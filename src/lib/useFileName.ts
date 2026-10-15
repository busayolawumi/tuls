import { useState } from 'react'
import { fileName, splitName } from './fileName'

/**
 * A file name someone can change before saving. It starts as `start`'s base
 * (e.g. "report-merged" for report-merged.pdf); `name` is what to save as,
 * always with the same extension.
 */
export function useFileName(start: string) {
  const [base, extension] = splitName(start)
  const [typed, setTyped] = useState(base)
  return { typed, setTyped, extension, name: fileName(typed, base, extension) }
}
