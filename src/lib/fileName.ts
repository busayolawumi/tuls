// Names for the files Tuls makes, when someone types their own.

// Characters some system won't allow in a file name (Windows is the
// strictest). Control characters go too, below.
const NOT_ALLOWED = /[/\\:*?"<>|]/g
// Names Windows keeps for itself, whatever the extension.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
const MAX_LENGTH = 150

/** A file name split into its base and its extension (with the dot). */
export function splitName(name: string): [base: string, extension: string] {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
}

/**
 * The name to save a file as: what was typed, made safe on every system,
 * plus `extension`. If nothing usable was typed, it's `fallback` instead.
 * Typing the extension too doesn't double it.
 */
export function fileName(typed: string, fallback: string, extension = '') {
  // Tabs and new lines become spaces first, so words stay apart.
  let base = [...typed.replace(/\s+/g, ' ').replace(NOT_ALLOWED, '')]
    .filter((char) => char >= ' ' && char !== '\u007f')
    .join('')
    .trim()
  if (extension && base.toLowerCase().endsWith(extension.toLowerCase())) {
    base = base.slice(0, -extension.length)
  }
  base = base
    .slice(0, MAX_LENGTH)
    // A leading dot hides a file; Windows drops trailing dots and spaces.
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  if (!base || RESERVED.test(base)) base = fallback
  return `${base}${extension}`
}
