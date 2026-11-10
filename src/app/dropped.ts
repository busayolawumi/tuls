import type { ToolManifest } from '../tools/types.ts'

type Named = Pick<File, 'name' | 'type'>

// For files without an extension, as some apps share them.
const BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const SAME_AS: Record<string, string> = { jfif: 'jpg', jpe: 'jpg' }

/** The file's kind, as a lowercase extension: "IMG_1.HEIC" → "heic". */
export function kindOf(file: Named) {
  const match = /\.([a-z0-9]+)$/i.exec(file.name)
  const extension = match?.[1].toLowerCase() ?? BY_TYPE[file.type]
  return extension && (SAME_AS[extension] ?? extension)
}

/** For the home page's file picker: everything some tool opens. */
export function acceptAll(tools: ToolManifest[]) {
  const extensions = new Set(tools.flatMap((tool) => tool.accepts))
  return [
    ...Object.keys(BY_TYPE),
    ...[...extensions, ...Object.keys(SAME_AS)].map((e) => `.${e}`),
  ].join(',')
}

export type Fit =
  | { tools: ToolManifest[] }
  | { problem: 'unknown'; kinds: string[] }
  | { problem: 'mixed' | 'one at a time' }

/**
 * The tools that open every one of the files, in the home page's order.
 * Tools that take one file only count when there's one file.
 */
export function toolsFor(tools: ToolManifest[], files: Named[]): Fit {
  const kinds = files.map(kindOf)
  const unknown = kinds.filter(
    (kind) => !tools.some((tool) => kind && tool.accepts.includes(kind)),
  )
  if (unknown.length) {
    return {
      problem: 'unknown',
      kinds: [...new Set(unknown.map((kind) => kind ?? ''))],
    }
  }
  const fitting = tools.filter((tool) =>
    kinds.every((kind) => kind && tool.accepts.includes(kind)),
  )
  const usable = fitting.filter((tool) => files.length === 1 || !tool.single)
  if (usable.length) return { tools: usable }
  return { problem: fitting.length ? 'one at a time' : 'mixed' }
}

const joined = (items: string[], word: 'and' | 'or') =>
  items.length < 2
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`

/** What can't be opened, e.g. "Tuls can’t open ZIP or RAR files yet." */
export function unknownMessage(kinds: string[]) {
  const named = kinds.filter(Boolean).map((kind) => kind.toUpperCase())
  if (!named.length) return 'Tuls can’t open this kind of file yet.'
  return `Tuls can’t open ${joined(named, 'or')} files yet.`
}

export const FIT_MESSAGES = {
  mixed:
    'No one tool opens all of these together. Choose files of one kind, like only PDFs or only images.',
  'one at a time':
    'The tools for these take one file at a time. Choose just one of them.',
}

/** "report.pdf", or "these 3 files". */
export const filesTitle = (files: Named[]) =>
  files.length === 1 ? files[0].name : `these ${files.length} files`

/** "a.pdf, b.pdf and c.pdf", or the first three "and 2 more". */
export function fileNames(files: Named[]) {
  const names = files.map((file) => file.name)
  if (names.length <= 4) return joined(names, 'and')
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}
