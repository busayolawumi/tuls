import type { Level } from '../../../engines/images/fit'
import { formatSize } from '../../../lib/format'
import { suffixedNames } from '../../resize-images/lib/resize'

export type Choice = Level | 'under'
export type Settings = { choice: Choice; under: string }

export const CHOICES: [Choice, string][] = [
  ['recommended', 'Recommended'],
  ['smallest', 'Smallest'],
  ['under', 'Fit under a size'],
]

export const CHOICE_NOTES: Record<Choice, string> = {
  recommended: 'Looks the same, at full size.',
  smallest: 'Smaller still. Very big photos become 2560 pixels across.',
  under: 'The best quality that fits under the size you choose.',
}

export const MIN_MB = 0.05
export const MAX_MB = 100

/** "2", "0.5" or "0,5" MB, in bytes, or undefined if it isn't a size Tuls takes. */
export function underBytes(text: string) {
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(text)) return undefined
  const mb = Number(text.replace(',', '.'))
  if (mb < MIN_MB || mb > MAX_MB) return undefined
  return Math.round(mb * 1e6)
}

/** IMG_1.HEIC → IMG_1-compressed.jpg, numbered if two match. */
export const compressedNames = (files: Pick<File, 'name' | 'type'>[]) =>
  suffixedNames(files, 'compressed')

/** What to say when a picture was made smaller to get there. */
export function sizeNote(
  width: number,
  height: number,
  choice: Choice,
  under: number | undefined,
) {
  return choice === 'under' && under
    ? `Made ${width} × ${height} to fit under ${formatSize(under)}.`
    : `Made ${width} × ${height}, as Smallest does with very big pictures.`
}

const KEY = 'tuls:compress-images:settings'
const DEFAULTS: Settings = { choice: 'recommended', under: '1' }

export function loadSettings(
  storage: Pick<Storage, 'getItem'> | undefined,
): Settings {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? '{}') as Partial<Settings>
    return {
      choice: CHOICES.some(([value]) => value === saved.choice)
        ? (saved.choice as Choice)
        : DEFAULTS.choice,
      under:
        typeof saved.under === 'string' && /^[\d.,]{0,6}$/.test(saved.under)
          ? saved.under
          : DEFAULTS.under,
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
