// Quick looks at a PDF's bytes for a name, without reading the PDF: enough
// to know whether it may be locked or signed. These names sit in the file
// in plain view, even in encrypted PDFs.

const isLetter = (byte: number | undefined) => {
  const lower = (byte ?? 0) | 0x20
  return lower >= 0x61 && lower <= 0x7a
}

/** Whether `name` (e.g. "/Encrypt") is in the bytes, as a whole name. */
export function hasName(bytes: Uint8Array, name: string) {
  const wanted = new TextEncoder().encode(name)
  for (let at = bytes.indexOf(wanted[0]); at !== -1;) {
    let match = true
    for (let i = 1; i < wanted.length; i++) {
      if (bytes[at + i] !== wanted[i]) {
        match = false
        break
      }
    }
    // A longer name isn't this one: /EncryptMetadata isn't /Encrypt.
    if (match && !isLetter(bytes[at + wanted.length])) return true
    at = bytes.indexOf(wanted[0], at + 1)
  }
  return false
}

/** Whether a PDF names an encryption dictionary, so it may be locked. */
export const mentionsEncryption = (bytes: Uint8Array) =>
  hasName(bytes, '/Encrypt')

/**
 * Whether a PDF has a digital signature: every signature records which
 * bytes it covers (/ByteRange). Any change to the file stops it counting.
 */
export const isSigned = (bytes: Uint8Array) => hasName(bytes, '/ByteRange')
