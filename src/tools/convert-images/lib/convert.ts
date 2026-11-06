import { formatSize } from '../../../lib/format'
import { outputNames } from '../../../lib/outputNames'
import type { ImageFormat } from '../../../lib/picture'

export const FORMATS: [ImageFormat, string][] = [
  ['jpeg', 'JPG'],
  ['png', 'PNG'],
  ['webp', 'WebP'],
]

export const FORMAT_NOTES: Record<ImageFormat, string> = {
  jpeg: 'Works everywhere, and small for photos. See-through parts become white.',
  png: 'Exact, and keeps see-through parts. Photos come out much bigger.',
  webp: 'Small, and keeps see-through parts. A few older apps can’t open it.',
}

export const EXTENSIONS: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

/** Each new image's name: IMG_1234.HEIC → IMG_1234.jpg, numbered if two match. */
export const imageNames = (names: string[], format: ImageFormat) =>
  outputNames(names, EXTENSIONS[format])

/** "4032 × 3024 · 1.4 MB → 2.6 MB". */
export function sizeLine(
  width: number,
  height: number,
  before: number,
  after: number,
) {
  return `${width} × ${height} · ${formatSize(before)} → ${formatSize(after)}`
}

/** "4032 × 3024 · from 1.4 MB", for a list that shows the new size. */
export const listLine = (width: number, height: number, before: number) =>
  `${width} × ${height} · from ${formatSize(before)}`

/** What to say about a photo saved smaller than it is. */
export const smallerNote = (width: number, height: number) =>
  `Saved at ${width} × ${height}, the most this browser can make.`

const KEY = 'tuls:convert-images:format'

export function loadFormat(
  storage: Pick<Storage, 'getItem'> | undefined,
): ImageFormat {
  try {
    const saved = storage?.getItem(KEY)
    if (FORMATS.some(([value]) => value === saved)) return saved as ImageFormat
  } catch {
    // Storage can be blocked.
  }
  return 'jpeg'
}

export function saveFormat(
  storage: Pick<Storage, 'setItem'> | undefined,
  format: ImageFormat,
) {
  try {
    storage?.setItem(KEY, format)
  } catch {
    // Not remembered, which is fine.
  }
}
