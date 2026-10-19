// What Protect PDF says about a password while it's typed. Nothing here
// stops a password being used, except one too long for a PDF.

/** A PDF's AES-256 password counts its first 127 bytes (UTF-8). */
export const MAX_PASSWORD_BYTES = 127
/** Below this, a hint that it's easy to guess. */
export const SHORT_PASSWORD = 8

const bytes = (text: string) => new TextEncoder().encode(text).length

/**
 * Whether the password is too long for a PDF, as typed or broken up for
 * Apple's readers (see engines/pdf/passwords.ts).
 */
export function isTooLong(password: string) {
  return (
    Math.max(
      bytes(password.normalize('NFC')),
      bytes(password.normalize('NFD')),
    ) > MAX_PASSWORD_BYTES
  )
}

/** Whether to hint that a password is short. Not for an empty one. */
export function isShort(password: string) {
  return password.length > 0 && [...password].length < SHORT_PASSWORD
}

/**
 * The characters iPhones and Macs can't open a PDF with, if any. Tested
 * with Apple's PDFKit (Safari, Preview, Files) against qpdf's PDFs; every
 * other reader opened them all. Three kinds fail:
 *
 * - marks that stay separate from their letter, even composed: Yoruba and
 *   Igbo tones on dotted letters (ẹ̀, ọ́), Hindi and Thai vowel signs
 * - characters outside the basic plane: emoji, rare scripts
 * - compatibility forms, which Unicode would swap for plainer ones:
 *   full-width and half-width letters (Ａ, ｱ), ligatures (ﬁ), …, ™, ½, ²
 *
 * Accented letters that compose into one (é, ñ, Ọ), and Greek, Cyrillic,
 * Arabic, Hebrew, Chinese, Japanese and Korean, all open.
 */
export function appleTrouble(password: string): string[] {
  const found: string[] = []
  const letters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const { segment } of letters.segment(password.normalize('NFC'))) {
    const trouble =
      /\p{M}/u.test(segment) ||
      [...segment].some((char) => char.codePointAt(0)! > 0xffff) ||
      segment.normalize('NFKC') !== segment
    if (trouble && !found.includes(segment)) found.push(segment)
  }
  return found
}

/** "ẹ̀", "ẹ̀ and 🙂", "ẹ̀, ọ́ and 🙂". */
export function listed(items: string[]) {
  return items.length > 1
    ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    : (items[0] ?? '')
}
