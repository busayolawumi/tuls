// Free fonts Tuls gives LibreOffice, so documents that use them come out in
// the very font Office used, not a stand-in (substitutes.ts). They're the
// most common fonts from Google Fonts, used by Google Docs and Slides and
// many templates, and documents made with them on Windows or a Mac.
//
// The files are Google Fonts' own, unmodified, from the Expo Google Fonts
// packages (pinned in package.json): regular, bold, italic and bold italic.
// Each package's LICENSE_FONT has the font's licence (public/licences.txt).
// Measured on 2026-10-17: 46 files, 9.4 MB, and 4.7 MB in the ZIP Tuls serves.
//
// Left out: Merriweather, at 4.2 MB on its own (substitutes.ts has its
// stand-in). Oswald has no italics; LibreOffice slants it, as Office does.

export type FreeFont = {
  family: string
  /** The package, @expo-google-fonts/<package>. */
  package: string
  /** The start of its files' names, e.g. OpenSans_700Bold.ttf. */
  file: string
  italics?: false
}

export const FREE_FONTS: FreeFont[] = [
  { family: 'Roboto', package: 'roboto', file: 'Roboto' },
  { family: 'Open Sans', package: 'open-sans', file: 'OpenSans' },
  { family: 'Lato', package: 'lato', file: 'Lato' },
  { family: 'Montserrat', package: 'montserrat', file: 'Montserrat' },
  { family: 'Poppins', package: 'poppins', file: 'Poppins' },
  { family: 'Inter', package: 'inter', file: 'Inter' },
  { family: 'Raleway', package: 'raleway', file: 'Raleway' },
  { family: 'Nunito', package: 'nunito', file: 'Nunito' },
  { family: 'Source Sans 3', package: 'source-sans-3', file: 'SourceSans3' },
  { family: 'Ubuntu', package: 'ubuntu', file: 'Ubuntu' },
  { family: 'Oswald', package: 'oswald', file: 'Oswald', italics: false },
  {
    family: 'Playfair Display',
    package: 'playfair-display',
    file: 'PlayfairDisplay',
  },
]

const STYLES = ['400Regular', '700Bold']
const ITALICS = ['400Regular_Italic', '700Bold_Italic']

/** A family's files, as paths inside node_modules. */
export function freeFontFiles(font: FreeFont) {
  const styles = font.italics === false ? STYLES : [...STYLES, ...ITALICS]
  return styles.map(
    (style) =>
      `@expo-google-fonts/${font.package}/${style}/${font.file}_${style}.ttf`,
  )
}
