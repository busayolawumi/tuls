/** A file's name without its extension, e.g. report.docx → report. */
export function documentBase(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').trim() || 'document'
}

/**
 * Each converted file's name: the original's, with `extension` (e.g.
 * "pdf"). Files with the same name get a number, so a ZIP doesn't lose any:
 * report.pdf, report (2).pdf.
 */
export function outputNames(names: string[], extension: string) {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = documentBase(name)
    const key = base.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count === 1
      ? `${base}.${extension}`
      : `${base} (${count}).${extension}`
  })
}
