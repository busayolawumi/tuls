// Which pages to turn into images, what kind, how sharp, and their names.

// Every image is kept until it's saved, so a long PDF at High quality could
// fill a phone's memory.
export const MAX_PAGES = 300

export type Format = 'jpeg' | 'png'
export type Quality = 'standard' | 'high'
export type Settings = { format: Format; quality: Quality }

/** Dots per inch: Standard is plenty for screens, High is for printing. */
export const DPI: Record<Quality, number> = { standard: 150, high: 300 }

export const MIME: Record<Format, 'image/jpeg' | 'image/png'> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
}

const EXTENSION: Record<Format, string> = { jpeg: 'jpg', png: 'png' }

/** An image's name, e.g. report-page-3.jpg (pages numbered from 0). */
export function imageName(base: string, page: number, format: Format) {
  return `${base}-page-${page + 1}.${EXTENSION[format]}`
}

/** "1 image", "12 images". */
export function imagesLabel(count: number) {
  return `${count} ${count === 1 ? 'image' : 'images'}`
}

/** Every page of `count`, numbered from 0. */
export function allPages(count: number): ReadonlySet<number> {
  return new Set(Array.from({ length: count }, (_, i) => i))
}

/** Adds a page to the chosen ones, or takes it out. */
export function togglePage(chosen: ReadonlySet<number>, page: number) {
  const next = new Set(chosen)
  if (next.has(page)) next.delete(page)
  else next.add(page)
  return next
}

/** "All 12 pages", "3 of 12 pages", or a nudge when none are chosen. */
export function chosenLabel(chosen: number, count: number) {
  if (chosen === 0) return 'Choose at least one page.'
  if (chosen === count) return count === 1 ? '1 page' : `All ${count} pages`
  return `${chosen} of ${count} pages`
}

const KEY = 'tuls:pdf-to-images:settings'
const DEFAULTS: Settings = { format: 'jpeg', quality: 'standard' }

/** The kind and quality chosen last time, or JPG at Standard. */
export function loadSettings(
  storage: Pick<Storage, 'getItem'> | undefined,
): Settings {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return {
      format: saved?.format === 'png' ? 'png' : DEFAULTS.format,
      quality: saved?.quality === 'high' ? 'high' : DEFAULTS.quality,
    }
  } catch {
    // Blocked storage, or something that isn't ours.
    return DEFAULTS
  }
}

/** Remembers the kind and quality for next time, if the browser allows. */
export function saveSettings(
  storage: Pick<Storage, 'setItem'> | undefined,
  settings: Settings,
) {
  try {
    storage?.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Not remembered, which is fine.
  }
}
