// Plain data, so the build can read it too (plugins/tesseract.ts). Codes are
// Tesseract's, with a package @tesseract.js-data/<code> for each.

export type Language = {
  code: string
  name: string
  /** The browser's language tags it matches, e.g. "fr" for fr-FR and fr-CA. */
  tag: string
}

export const LANGUAGES: Language[] = [
  { code: 'eng', name: 'English', tag: 'en' },
  { code: 'fra', name: 'French', tag: 'fr' },
  { code: 'deu', name: 'German', tag: 'de' },
  { code: 'ita', name: 'Italian', tag: 'it' },
  { code: 'nld', name: 'Dutch', tag: 'nl' },
  { code: 'por', name: 'Portuguese', tag: 'pt' },
  { code: 'spa', name: 'Spanish', tag: 'es' },
  { code: 'yor', name: 'Yoruba', tag: 'yo' },
]
