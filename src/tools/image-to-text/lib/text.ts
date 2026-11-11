import { documentBase } from '../../../lib/outputNames'

export const MAX_IMAGES = 20
export const NO_TEXT = 'No text found in it.'

/** Text as read, without spaces at line ends or runs of blank lines. */
export function tidyText(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export type ImageText = { name: string; text: string }

/** Everything read, as one text: with several images, each under its name. */
export function allText(read: ImageText[]) {
  if (read.length === 1) return read[0].text
  return read
    .map(({ name, text }) => `${name}\n\n${text || NO_TEXT}`)
    .join('\n\n\n')
}

/** The .txt file's name: after the image, or a general one for several. */
export const textFileName = (names: string[]) =>
  names.length === 1 ? `${documentBase(names[0])}.txt` : 'Text from images.txt'

export const wordsLabel = (text: string) => {
  const words =
    text.match(/[\p{L}\p{M}\p{N}]+(?:[.,'’][\p{L}\p{M}\p{N}]+)*/gu)?.length ?? 0
  return words === 1 ? '1 word' : `${words} words`
}

// Words Tesseract is less sure of than this are mostly noise from pictures
// and backgrounds. A stylised logo's real words scored 56 and 95.
export const KEEP_WORD = 50
// Under this many letters, a read probably missed scattered text.
export const FEW_LETTERS = 20

const LETTER = /[\p{L}\p{N}]/u

/**
 * The text of the words Tesseract was sure enough of, keeping its lines and
 * paragraphs. Words without a letter or digit (stray marks) are left out.
 */
export function confidentText(
  paragraphs: { text: string; confidence: number }[][][],
) {
  return paragraphs
    .map((lines) =>
      lines
        .map((words) =>
          words
            .filter(
              (word) => word.confidence >= KEEP_WORD && LETTER.test(word.text),
            )
            .map((word) => word.text)
            .join(' '),
        )
        .filter(Boolean)
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n')
}

/** How much a read found: its letters and digits. */
export const letterCount = (text: string) =>
  text.match(/[\p{L}\p{N}]/gu)?.length ?? 0

/**
 * How much a read is worth: each sure word's letters, weighted by how sure.
 * Compares reads of the same image done different ways.
 */
export function sureScore(
  paragraphs: { text: string; confidence: number }[][][],
) {
  let score = 0
  for (const lines of paragraphs) {
    for (const words of lines) {
      for (const word of words) {
        if (word.confidence < KEEP_WORD) continue
        score += (letterCount(word.text) * word.confidence) / 100
      }
    }
  }
  return score
}

/** How much to enlarge a small image for reading: up to about 1,000 pixels. */
export const enlargement = (width: number, height: number) =>
  Math.min(4, Math.max(1, Math.round(1000 / Math.max(width, height))))

// A word that counts as real text: this many letters, read this surely.
const REAL_LETTERS = 3
const REAL_CONFIDENCE = 70

export const CANT_READ =
  'Tuls couldn’t read the text in this image. It works best with screenshots, and with documents and signs photographed straight on.'

/**
 * Whether a read found real text, not fragments of a picture: at least one
 * sure word of 3 or more letters, making up at least half of what was found.
 * A stadium photo's curved and slanted lettering gave only scattered single
 * letters (i, E, v, y, 4, a), while a hard logo's real words read at 73–95.
 */
export function isReliable(
  paragraphs: { text: string; confidence: number }[][][],
) {
  let real = 0
  let all = 0
  for (const lines of paragraphs) {
    for (const words of lines) {
      for (const word of words) {
        if (word.confidence < KEEP_WORD) continue
        const letters = letterCount(word.text)
        all += letters
        if (letters >= REAL_LETTERS && word.confidence >= REAL_CONFIDENCE) {
          real += letters
        }
      }
    }
  }
  return real > 0 && real * 2 >= all
}
