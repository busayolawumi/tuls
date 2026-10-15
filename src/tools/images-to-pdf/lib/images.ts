import type { PageSize } from '../../../engines/pdf/images'
import { formatSize } from '../../../lib/format'

// What Images to PDF takes, how it names the PDF, and which paper it starts
// with.

const TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
]
const EXTENSIONS = /\.(jpe?g|jfif|png|webp|gif|heic|heif|avif|bmp)$/i

/** For the file picker's `accept` attribute. */
export const ACCEPT = [
  ...TYPES,
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
].join(',')

// Each image is read into memory, and big ones are hard on phones.
export const MAX_IMAGE_SIZE = 50_000_000
export const MAX_IMAGES = 100

/** Says why a file can't be used, or returns undefined if it can. */
export function checkImage(file: File): string | undefined {
  if (!TYPES.includes(file.type) && !EXTENSIONS.test(file.name)) {
    return 'That isn’t an image Tuls can use. Try a JPG, PNG, WebP, GIF or HEIC.'
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return `That image is ${formatSize(file.size)}. Each image can be up to ${formatSize(MAX_IMAGE_SIZE)}.`
  }
}

/** HEIC is what iPhones save photos as. Only Safari can open it so far. */
export function isHeic(file: File) {
  return /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

/** JPEG and PNG go into the PDF as they are; anything else is redrawn. */
export function formatOf(start: Uint8Array): 'jpeg' | 'png' | undefined {
  if (start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff) {
    return 'jpeg'
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.every((byte, i) => start[i] === byte)) return 'png'
}

/** The PDF's name: the first image's, e.g. IMG_1234.jpg → IMG_1234.pdf. */
export function pdfName(firstImage: string) {
  return `${firstImage.replace(/\.[^.]*$/, '') || 'images'}.pdf`
}

/** "1 image", "12 images". */
export function imagesLabel(count: number) {
  return `${count} ${count === 1 ? 'image' : 'images'}`
}

const KEY = 'tuls:images-to-pdf:page-size'
const SIZES: PageSize[] = ['fit', 'a4', 'letter']

/** The page size chosen last time, or "Same as image" (the owner's pick). */
export function loadPageSize(
  storage: Pick<Storage, 'getItem'> | undefined,
): PageSize {
  try {
    const saved = storage?.getItem(KEY)
    if (SIZES.includes(saved as PageSize)) return saved as PageSize
  } catch {
    // Storage can be blocked (private browsing, settings).
  }
  return 'fit'
}

/** Remembers the page size for next time, if the browser allows. */
export function savePageSize(
  storage: Pick<Storage, 'setItem'> | undefined,
  size: PageSize,
) {
  try {
    storage?.setItem(KEY, size)
  } catch {
    // Not remembered, which is fine.
  }
}
