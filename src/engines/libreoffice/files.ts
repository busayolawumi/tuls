import { formatSize } from '../../lib/format'
import type { OfficeErrorKind } from './errors'

// What the Office tools check before converting a file, and how they name
// what they make.

/** A file's extension, which tells LibreOffice what it is, e.g. "docx". */
export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}

// Each document is read into memory, and LibreOffice needs several times
// its size while converting. Phones manage far less (see PHONE_SIZE).
export const MAX_FILE_SIZE = 100_000_000
export const MAX_FILES = 20
/** Above this, a phone may run out of memory (CLAUDE.md, spike results). */
export const PHONE_SIZE = 5_000_000

/** For the file picker's `accept` attribute, e.g. ".docx,.doc". */
export function acceptOf(extensions: string[]) {
  return extensions.map((extension) => `.${extension}`).join(',')
}

/**
 * Says why a file can't be used, or returns undefined if it can. `what` is
 * the kind of document, e.g. "a Word document".
 */
export function checkDocument(
  file: File,
  extensions: string[],
  what: string,
): string | undefined {
  if (!extensions.includes(extensionOf(file.name))) {
    return `That isn’t ${what}.`
  }
  if (file.size === 0) return 'That file is empty.'
  if (file.size > MAX_FILE_SIZE) {
    return `That file is ${formatSize(file.size)}. Each can be up to ${formatSize(MAX_FILE_SIZE)}.`
  }
}

/** A document's name without its extension, e.g. report.docx → report. */
export function documentBase(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').trim() || 'document'
}

/**
 * Each converted file's name: the document's, as a PDF. Documents with the
 * same name get a number, so a ZIP doesn't lose any: report.pdf, report
 * (2).pdf.
 */
export function pdfNames(names: string[]) {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const base = documentBase(name)
    const key = base.toLowerCase()
    const count = (seen.get(key) ?? 0) + 1
    seen.set(key, count)
    return count === 1 ? `${base}.pdf` : `${base} (${count}).pdf`
  })
}

// How files start, to catch a wrong or locked file before LibreOffice sees
// it. LibreOffice opens anything it doesn't recognise as plain text, so a
// wrong file would otherwise become a PDF of gibberish.
const ZIP = [0x50, 0x4b, 0x03, 0x04]
// Microsoft's older container, which also holds password-protected .docx,
// .xlsx and .pptx files.
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
const RTF = [...'{\\rtf'].map((c) => c.charCodeAt(0))
// Office Open XML and OpenDocument files are ZIPs.
const ZIPPED = ['docx', 'xlsx', 'xlsm', 'pptx', 'ppsx', 'odt', 'ods', 'odp']

const startsWith = (head: Uint8Array, magic: number[]) =>
  magic.every((byte, i) => head[i] === byte)

/**
 * What's wrong with a file, judging by its first 8 bytes, or undefined if
 * it looks right. Only the formats that can be told apart surely are
 * checked: many .doc files, for one, are really RTF or HTML, and convert.
 */
export function contentProblem(
  extension: string,
  head: Uint8Array,
): OfficeErrorKind | undefined {
  if (ZIPPED.includes(extension)) {
    if (startsWith(head, ZIP)) return undefined
    return startsWith(head, OLE) ? 'password' : 'unreadable'
  }
  if (extension === 'rtf' && !startsWith(head, RTF)) return 'unreadable'
}

/**
 * A language tag for LibreOffice, e.g. "en-NG", from the browser's, if it's
 * a plain one: language, maybe a script, maybe a region.
 */
export function languageTag(tag: string | undefined) {
  if (!tag) return undefined
  const match = /^([a-z]{2,3})(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|\d{3}))?$/i.exec(
    tag,
  )
  if (!match) return undefined
  const [, language, script = '', region = ''] = match
  return `${language.toLowerCase()}${script}${region.toUpperCase()}`
}
