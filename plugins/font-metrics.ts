// Reads character widths from TrueType fonts: just enough of the format
// (head, hhea, hmtx and a format 4 cmap) for Tuls to measure text the way
// LibreOffice will lay it out (see src/engines/libreoffice/word/).

/** The characters measured: printable ASCII, Latin-1 and common punctuation. */
export const CODE_POINTS = [
  ...Array.from({ length: 95 }, (_, i) => 32 + i),
  ...Array.from({ length: 96 }, (_, i) => 160 + i),
  0x2013,
  0x2014,
  0x2018,
  0x2019,
  0x201c,
  0x201d,
  0x2022,
  0x2026,
  0x20ac,
]

/** A font's advance widths, in its own units, in CODE_POINTS order (0 if missing). */
export type FontWidths = { unitsPerEm: number; widths: number[] }

function tables(font: Buffer) {
  const found = new Map<string, number>()
  const count = font.readUInt16BE(4)
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16
    found.set(
      font.toString('latin1', record, record + 4),
      font.readUInt32BE(record + 8),
    )
  }
  return found
}

/** The glyph for each code point, from a Unicode format 4 cmap subtable. */
function glyphs(font: Buffer, cmap: number) {
  const count = font.readUInt16BE(cmap + 2)
  let subtable = -1
  for (let i = 0; i < count; i++) {
    const record = cmap + 4 + i * 8
    const platform = font.readUInt16BE(record)
    const encoding = font.readUInt16BE(record + 2)
    const offset = cmap + font.readUInt32BE(record + 4)
    const unicode =
      (platform === 3 && encoding === 1) || (platform === 0 && encoding <= 4)
    if (unicode && font.readUInt16BE(offset) === 4) {
      subtable = offset
      break
    }
  }
  if (subtable < 0) throw new Error('No Unicode format 4 cmap')
  const segments = font.readUInt16BE(subtable + 6) / 2
  const ends = subtable + 14
  const starts = ends + segments * 2 + 2
  const deltas = starts + segments * 2
  const ranges = deltas + segments * 2
  return (codePoint: number) => {
    for (let i = 0; i < segments; i++) {
      if (font.readUInt16BE(ends + i * 2) < codePoint) continue
      const start = font.readUInt16BE(starts + i * 2)
      if (start > codePoint) return 0
      const delta = font.readInt16BE(deltas + i * 2)
      const range = font.readUInt16BE(ranges + i * 2)
      if (range === 0) return (codePoint + delta) & 0xffff
      const at = ranges + i * 2 + range + (codePoint - start) * 2
      const glyph = font.readUInt16BE(at)
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff
    }
    return 0
  }
}

/** The advance widths of CODE_POINTS in a TrueType font. */
export function fontWidths(font: Buffer): FontWidths {
  const found = tables(font)
  const head = found.get('head')
  const hhea = found.get('hhea')
  const hmtx = found.get('hmtx')
  const cmap = found.get('cmap')
  if (head === undefined || hhea === undefined || hmtx === undefined) {
    throw new Error('Not a TrueType font')
  }
  if (cmap === undefined) throw new Error('No cmap')
  const unitsPerEm = font.readUInt16BE(head + 18)
  const metrics = font.readUInt16BE(hhea + 34)
  const glyphOf = glyphs(font, cmap)
  const advance = (glyph: number) =>
    font.readUInt16BE(hmtx + Math.min(glyph, metrics - 1) * 4)
  return {
    unitsPerEm,
    widths: CODE_POINTS.map((codePoint) => {
      const glyph = glyphOf(codePoint)
      return glyph ? advance(glyph) : 0
    }),
  }
}
