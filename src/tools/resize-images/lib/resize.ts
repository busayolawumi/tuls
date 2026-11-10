import { formatSize } from '../../../lib/format'
import { documentBase, outputNames } from '../../../lib/outputNames'
import type { ImageFormat } from '../../../lib/picture'
import { EXTENSIONS } from '../../convert-images/lib/convert'

export type Mode = 'percent' | 'size'
export type Settings = {
  mode: Mode
  percent: string
  width: string
  height: string
}
export type Target = { percent: number } | { width?: number; height?: number }

const DEFAULTS: Settings = {
  mode: 'percent',
  percent: '50',
  width: '',
  height: '',
}
const WHOLE = /^\d{1,6}$/

/** What the boxes ask for, or undefined where they don't make sense yet. */
export function targetOf(settings: Settings): Target | undefined {
  if (settings.mode === 'percent') {
    const percent = WHOLE.test(settings.percent) ? Number(settings.percent) : 0
    return percent >= 1 && percent <= 99 ? { percent } : undefined
  }
  const side = (text: string) =>
    WHOLE.test(text) && Number(text) >= 1 ? Number(text) : undefined
  const width = side(settings.width)
  const height = side(settings.height)
  if (settings.width && !width) return undefined
  if (settings.height && !height) return undefined
  return width || height ? { width, height } : undefined
}

/** The size an image comes out at. Proportions stay, and it never grows. */
export function newSize(width: number, height: number, target: Target) {
  const scale =
    'percent' in target
      ? target.percent / 100
      : Math.min(
          1,
          target.width ? target.width / width : 1,
          target.height ? target.height / height : 1,
        )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** The same format, unless few apps could open it: HEIC becomes JPG. */
export function formatFor(file: Pick<File, 'name' | 'type'>): ImageFormat {
  const kind = file.type || file.name.toLowerCase().replace(/^.*\./, '')
  if (/png|gif|bmp/.test(kind)) return 'png'
  if (/webp/.test(kind)) return 'webp'
  return 'jpeg'
}

/** IMG_1.HEIC → IMG_1-resized.jpg, numbered if two match. */
export const resizedNames = (files: Pick<File, 'name' | 'type'>[]) =>
  suffixedNames(files, 'resized')

/** Each new image's name: its original's, a suffix and its new format. */
export function suffixedNames(
  files: Pick<File, 'name' | 'type'>[],
  suffix: string,
) {
  const named = outputNames(
    files.map((file) => `${documentBase(file.name)}-${suffix}.x`),
    'x',
  )
  return named.map((name, i) =>
    name.replace(/x$/, EXTENSIONS[formatFor(files[i])]),
  )
}

/** "4032 × 3024 → 2016 × 1512". */
export const sizeChange = (
  from: { width: number; height: number },
  to: { width: number; height: number },
) =>
  from.width === to.width && from.height === to.height
    ? `${to.width} × ${to.height}`
    : `${from.width} × ${from.height} → ${to.width} × ${to.height}`

/** "4032 × 3024 → 2016 × 1512 · 1.4 MB → 620 KB". */
export const detailLine = (
  from: { width: number; height: number },
  to: { width: number; height: number },
  before: number,
  after: number,
) => `${sizeChange(from, to)} · ${formatSize(before)} → ${formatSize(after)}`

const KEY = 'tuls:resize-images:settings'

export function loadSettings(
  storage: Pick<Storage, 'getItem'> | undefined,
): Settings {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Settings>
    const text = (value: unknown, fallback: string) =>
      typeof value === 'string' && /^\d{0,6}$/.test(value) ? value : fallback
    return {
      mode: saved.mode === 'size' ? 'size' : DEFAULTS.mode,
      percent: text(saved.percent, DEFAULTS.percent),
      width: text(saved.width, DEFAULTS.width),
      height: text(saved.height, DEFAULTS.height),
    }
  } catch {
    return DEFAULTS
  }
}

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
