export const SEPARATORS = [',', ';', '\t', '|'] as const
export type Separator = (typeof SEPARATORS)[number]

/** Text from a CSV's bytes: UTF-8 or UTF-16 with a mark, UTF-8, or else Windows-1252. */
export function decodeText(bytes: Uint8Array) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Rows of fields, with quotes, doubled quotes and line breaks in quotes. */
export function parseRows(text: string, separator: string, limit = Infinity) {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  const end = () => {
    row.push(field)
    field = ''
  }
  while (i < text.length && rows.length < limit) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
      } else {
        field += char
      }
      i++
      continue
    }
    if (char === '"' && field === '') {
      quoted = true
    } else if (char === separator) {
      end()
    } else if (char === '\n' || char === '\r') {
      end()
      rows.push(row)
      row = []
      if (char === '\r' && text[i + 1] === '\n') i++
    } else {
      field += char
    }
    i++
  }
  if ((field !== '' || row.length > 0) && rows.length < limit) {
    end()
    rows.push(row)
  }
  return rows
}

/** The separator that splits the first lines most evenly into several fields. */
export function sniffSeparator(text: string, prefer?: Separator): Separator {
  let best: Separator = prefer ?? ','
  let bestScore = 0
  const order = prefer
    ? [prefer, ...SEPARATORS.filter((s) => s !== prefer)]
    : SEPARATORS
  for (const separator of order) {
    const sample = parseRows(text, separator, 50).filter(
      (row) => row.length > 1 || row[0] !== '',
    )
    const counts = new Map<number, number>()
    for (const row of sample) {
      counts.set(row.length, (counts.get(row.length) ?? 0) + 1)
    }
    let mode = 0
    let modeCount = 0
    for (const [fields, count] of counts) {
      if (count > modeCount || (count === modeCount && fields > mode)) {
        mode = fields
        modeCount = count
      }
    }
    const score = mode > 1 ? modeCount * 1000 + mode : 0
    if (score > bestScore) {
      best = separator
      bestScore = score
    }
  }
  return best
}

export type Csv = { rows: string[][]; separator: Separator }

/**
 * A CSV's rows, padded to the same length. Excel's "sep=;" first line
 * names the separator; otherwise it's worked out from the text.
 */
export function readCsv(text: string, prefer?: Separator): Csv {
  let body = text
  let separator: Separator | undefined
  const hint = /^sep=(.)\r?\n/i.exec(body)
  if (hint && (SEPARATORS as readonly string[]).includes(hint[1])) {
    separator = hint[1] as Separator
    body = body.slice(hint[0].length)
  }
  separator ??= sniffSeparator(body, prefer)
  const rows = parseRows(body, separator)
  while (rows.length && rows.at(-1)!.every((field) => field.trim() === '')) {
    rows.pop()
  }
  let width = 0
  for (const row of rows) width = Math.max(width, row.length)
  for (const row of rows) while (row.length < width) row.push('')
  return { rows, separator }
}
