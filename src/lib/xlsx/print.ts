export type Print = {
  paper: 'a4' | 'letter'
  landscape: boolean
  /** Shrink to the page's width; otherwise `scale` applies. */
  fit: boolean
  /** Percent, when not fitted. */
  scale: number
  /** Repeat the first column on pages to the right. */
  repeatFirstColumn: boolean
}

// Countries that use US Letter rather than A4.
const LETTER = new Set([
  'US',
  'CA',
  'MX',
  'PH',
  'PR',
  'CL',
  'CO',
  'VE',
  'CR',
  'GT',
  'PA',
  'DO',
  'SV',
  'NI',
])

export function paperFor(locale: string | undefined): Print['paper'] {
  try {
    const region = new Intl.Locale(locale ?? 'en-GB').maximize().region
    return region && LETTER.has(region) ? 'letter' : 'a4'
  } catch {
    return 'a4'
  }
}

// Printable widths in points, with Excel's default margins (0.7 in a side).
const WIDTH = {
  a4: { portrait: 595.3 - 100.8, landscape: 841.9 - 100.8 },
  letter: { portrait: 612 - 100.8, landscape: 792 - 100.8 },
}
const SMALLEST = 0.6

/** A column's printed width in points, from Excel's width in characters. */
export const columnPoints = (width: number) => (width * 7 + 5) * 0.75

/**
 * Portrait when the columns fit, or nearly; else landscape, shrunk to fit
 * if that leaves the text readable; else at the smallest size, with the
 * first column repeated on the pages to the right.
 */
export function printLayout(widths: number[], paper: Print['paper']): Print {
  let total = 0
  for (const width of widths) total += columnPoints(width)
  const page = WIDTH[paper]
  const base = { paper, scale: 100, repeatFirstColumn: false }
  if (total <= page.portrait) return { ...base, landscape: false, fit: false }
  if (page.portrait / total >= 0.85) {
    return { ...base, landscape: false, fit: true }
  }
  if (total <= page.landscape) return { ...base, landscape: true, fit: false }
  if (page.landscape / total >= SMALLEST) {
    return { ...base, landscape: true, fit: true }
  }
  return {
    paper,
    landscape: true,
    fit: false,
    scale: SMALLEST * 100,
    repeatFirstColumn: true,
  }
}
