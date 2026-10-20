export type Value =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; format: string }
  | { kind: 'date'; value: number; format: string }

/** How a column writes numbers and dates, from its own cells or the region. */
export type Column = { decimal: '.' | ','; dayFirst: boolean }

const CURRENCY = /^(£|\$|€|₦|¥|₹|GH₵)\s?|\s?(£|\$|€|₦|¥|₹)$/
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]
const NUMERIC_DATE = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4}|\d{2})$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const WORD_DATE = /^(\d{1,2})[ -]([A-Za-z]{3,9})\.?,?[ -](\d{4}|\d{2})$/
const MONTH_FIRST = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})$/
const UNAMBIGUOUS = {
  '.': /^\d{1,3}(,\d{3})+\.\d+$|^\d+\.\d{1,2}$/,
  ',': /^\d{1,3}(\.\d{3})+,\d+$|^\d+,\d{1,2}$/,
}
const GROUPED = {
  '.': /^\d{1,3}([, '  ]\d{3})+(\.\d+)?$/,
  ',': /^\d{1,3}([. '  ]\d{3})+(,\d+)?$/,
}
const PLAIN = { '.': /^\d+(\.\d+)?$/, ',': /^\d+(,\d+)?$/ }

/** The decimal mark and date order of `locale`, as Excel would use them. */
export function regionColumn(locale: string | undefined): Column {
  try {
    const decimal = new Intl.NumberFormat(locale)
      .formatToParts(1.5)
      .find((part) => part.type === 'decimal')?.value
    const order = new Intl.DateTimeFormat(locale)
      .formatToParts(new Date(2026, 2, 4))
      .map((part) => part.type)
    return {
      decimal: decimal === ',' ? ',' : '.',
      dayFirst: order.indexOf('day') < order.indexOf('month'),
    }
  } catch {
    return { decimal: '.', dayFirst: true }
  }
}

function digitsOf(text: string) {
  return text
    .replace(CURRENCY, '')
    .replace(/^[(\-−–+]|\)$|-$|\s?(CR|DR|OD|Cr|Dr)$|%$/g, '')
    .trim()
}

/** A column's decimal mark and date order, from its cells where they tell. */
export function readColumn(cells: string[], region: Column): Column {
  let point = 0
  let comma = 0
  let dayFirst: boolean | undefined
  for (const cell of cells) {
    const text = cell.trim()
    const date = NUMERIC_DATE.exec(text)
    if (date) {
      if (Number(date[1]) > 12) dayFirst = true
      else if (Number(date[3]) > 12 && dayFirst === undefined) dayFirst = false
      continue
    }
    const digits = digitsOf(text)
    if (UNAMBIGUOUS['.'].test(digits)) point++
    if (UNAMBIGUOUS[','].test(digits)) comma++
  }
  return {
    decimal: comma > point ? ',' : point > comma ? '.' : region.decimal,
    dayFirst: dayFirst ?? region.dayFirst,
  }
}

const EPOCH = Date.UTC(1899, 11, 30)

function serial(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined
  }
  return (date.getTime() - EPOCH) / 86_400_000
}

function fullYear(year: string) {
  if (year.length === 4) return Number(year)
  const short = Number(year)
  return short < 30 ? 2000 + short : 1900 + short
}

function monthOf(name: string) {
  const index = MONTHS.indexOf(name.slice(0, 3).toLowerCase())
  return index < 0 ? undefined : index + 1
}

function readDate(text: string, column: Column): Value | undefined {
  let match = ISO_DATE.exec(text)
  if (match) {
    const value = serial(Number(match[1]), Number(match[2]), Number(match[3]))
    return value === undefined
      ? undefined
      : { kind: 'date', value, format: 'yyyy-mm-dd' }
  }
  match = NUMERIC_DATE.exec(text)
  if (match) {
    const [, first, mark, second, year] = match
    const [day, month] = column.dayFirst ? [first, second] : [second, first]
    const value = serial(fullYear(year), Number(month), Number(day))
    if (value === undefined) return undefined
    const pad = first.length === 2 ? 'dd' : 'd'
    const months = second.length === 2 ? 'mm' : 'm'
    const years = year.length === 4 ? 'yyyy' : 'yy'
    const parts = column.dayFirst ? [pad, months] : [months, pad]
    const separator = mark === '.' ? '\\.' : mark
    return {
      kind: 'date',
      value,
      format: [...parts, years].join(separator),
    }
  }
  match = WORD_DATE.exec(text)
  if (match) {
    const month = monthOf(match[2])
    const value = month && serial(fullYear(match[3]), month, Number(match[1]))
    if (!value) return undefined
    const day = match[1].length === 2 ? 'dd' : 'd'
    const months = match[2].length > 3 ? 'mmmm' : 'mmm'
    const years = match[3].length === 4 ? 'yyyy' : 'yy'
    const separator = text.includes('-') ? '-' : ' '
    return {
      kind: 'date',
      value,
      format: [day, months, years].join(separator),
    }
  }
  match = MONTH_FIRST.exec(text)
  if (match) {
    const month = monthOf(match[1])
    const value = month && serial(Number(match[3]), month, Number(match[2]))
    if (!value) return undefined
    return {
      kind: 'date',
      value,
      format: `${match[1].length > 3 ? 'mmmm' : 'mmm'} d, yyyy`,
    }
  }
}

function quoted(symbol: string) {
  return `"${symbol}"`
}

function readNumber(text: string, column: Column): Value | undefined {
  let rest = text
  let negative = false
  if (/^\(.*\)$/.test(rest)) {
    negative = true
    rest = rest.slice(1, -1).trim()
  }
  const suffix = /\s?(CR|DR|OD|Cr|Dr)$/.exec(rest)
  if (suffix) {
    negative = /DR|OD|Dr/.test(suffix[1])
    rest = rest.slice(0, suffix.index).trim()
  }
  if (rest.endsWith('-')) {
    negative = true
    rest = rest.slice(0, -1).trim()
  }
  if (/^[-−–]/.test(rest)) {
    negative = true
    rest = rest.slice(1).trim()
  } else if (rest.startsWith('+')) {
    if (/\s/.test(rest)) return undefined
    rest = rest.slice(1)
  }
  const currency = CURRENCY.exec(rest)
  const symbol = currency ? (currency[1] ?? currency[2]) : undefined
  if (currency) rest = rest.replace(CURRENCY, '').trim()
  if (/^[-−–]/.test(rest)) {
    negative = true
    rest = rest.slice(1).trim()
  }
  const percent = rest.endsWith('%')
  if (percent) rest = rest.slice(0, -1).trim()
  const { decimal } = column
  const grouped = GROUPED[decimal].test(rest)
  if (!grouped && !PLAIN[decimal].test(rest)) return undefined
  const [whole, fraction = ''] = rest.split(decimal)
  const integer = whole.replace(/\D/g, '')
  if (integer.length > 15) return undefined
  if (integer.length > 1 && integer.startsWith('0')) return undefined
  if (!grouped && !fraction && !symbol && !percent && integer.length > 11) {
    return undefined
  }
  let value = Number(`${integer}.${fraction || '0'}`)
  if (negative) value = -value
  if (percent) value /= 100
  const places = fraction ? `.${'0'.repeat(Math.min(fraction.length, 6))}` : ''
  const body = `${grouped || (symbol && integer.length > 3) ? '#,##0' : '0'}${places}`
  const format = percent
    ? `${body}%`
    : symbol
      ? text.trimEnd().endsWith(symbol)
        ? `${body} ${quoted(symbol)}`
        : `${quoted(symbol)}${body}`
      : body
  return { kind: 'number', value, format }
}

/** What a cell holds: a number, a date, text, or nothing. */
export function readValue(cell: string | null, column: Column): Value {
  const text = (cell ?? '').trim()
  if (!text) return { kind: 'empty' }
  return (
    readDate(text, column) ?? readNumber(text, column) ?? { kind: 'text', text }
  )
}

/**
 * One number format for a column, so its cells line up: the most common
 * currency, the most decimal places, and grouping if any cell had it.
 */
export function columnFormat(values: Value[]): string | undefined {
  const numbers = values.filter((value) => value.kind === 'number')
  if (numbers.length === 0) return undefined
  const counts = new Map<string, number>()
  let places = 0
  let grouped = false
  for (const { format } of numbers) {
    const shape = format.replace(/[#,0.]+/, '§')
    counts.set(shape, (counts.get(shape) ?? 0) + 1)
    places = Math.max(places, /\.(0+)/.exec(format)?.[1].length ?? 0)
    grouped ||= format.includes('#,##0')
  }
  const shape = [...counts].sort((a, b) => b[1] - a[1])[0][0]
  const body = `${grouped ? '#,##0' : '0'}${places ? `.${'0'.repeat(places)}` : ''}`
  return shape.replace('§', body)
}
