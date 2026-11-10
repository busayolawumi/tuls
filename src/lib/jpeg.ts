// A JPEG is a run of segments, each starting with 0xFF and a marker byte.
// Before the picture itself (from SOS on) come "application" segments
// (APP0 to APP15) and comments. Phones and cameras put a lot in them: EXIF
// (camera model, settings, date, GPS location, a small copy of the photo),
// XMP and IPTC. None of it is needed to show the picture.

const SOI = 0xd8
const SOS = 0xda
const EOI = 0xd9
const APP0 = 0xe0 // JFIF: pixel density. Harmless, and some readers want it.
const APP1 = 0xe1 // EXIF or XMP.
const APP2 = 0xe2 // A colour profile (ICC), which changes how colours look.
const APP14 = 0xee // Adobe: how the colours are stored, needed to read them.
const COM = 0xfe

/** Whether a segment stays: everything but personal details. */
function keep(marker: number) {
  if (marker === COM) return false
  if (marker < APP0 || marker > 0xef) return true
  return marker === APP0 || marker === APP2 || marker === APP14
}

export type CleanJpeg = {
  /** The same picture, byte for byte, without the details. */
  bytes: Uint8Array<ArrayBuffer>
  /** EXIF orientation, 1 to 8: how to turn the picture to show it upright. */
  orientation: number
}

/**
 * Removes a JPEG's personal details (EXIF, XMP, IPTC and comments: camera,
 * date, location and so on), keeping the picture exactly as it is, and
 * reads its EXIF orientation on the way. Throws if it isn't a JPEG.
 */
export function cleanJpeg(bytes: Uint8Array): CleanJpeg {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) throw new Error('Not a JPEG')
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let orientation: number | undefined
  let at = 2
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error('Damaged JPEG')
    // Any number of 0xFF can come before a marker, as padding.
    while (bytes[at + 1] === 0xff) at++
    const marker = bytes[at + 1]
    // The picture itself: copied as it is, to the end.
    if (marker === SOS || marker === EOI) {
      parts.push(bytes.subarray(at))
      break
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    const end = at + 2 + length
    if (length < 2 || end > bytes.length) throw new Error('Damaged JPEG')
    if (marker === APP1 && orientation === undefined) {
      orientation = exifOrientation(bytes.subarray(at + 4, end))
    }
    if (keep(marker)) parts.push(bytes.subarray(at, end))
    at = end
  }

  const clean = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    clean.set(part, offset)
    offset += part.length
  }
  return { bytes: clean, orientation: orientation ?? 1 }
}

/**
 * The orientation in an APP1 segment's EXIF (tag 0x0112), if it has one.
 * EXIF is "Exif\0\0" and then TIFF: a byte order (II or MM), 42, and where
 * the first list of tags is.
 */
function exifOrientation(data: Uint8Array): number | undefined {
  const header = String.fromCharCode(...data.subarray(0, 6))
  if (header !== 'Exif\0\0') return undefined
  try {
    const tiff = new DataView(data.buffer, data.byteOffset + 6, data.length - 6)
    const order = tiff.getUint16(0)
    if (order !== 0x4949 && order !== 0x4d4d) return undefined
    const little = order === 0x4949
    if (tiff.getUint16(2, little) !== 42) return undefined
    const tags = tiff.getUint32(4, little)
    const count = tiff.getUint16(tags, little)
    for (let i = 0; i < count; i++) {
      const entry = tags + 2 + i * 12
      if (tiff.getUint16(entry, little) !== 0x0112) continue
      const value = tiff.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : undefined
    }
  } catch {
    // Cut short or garbled: no orientation.
  }
  return undefined
}

/** A JPEG's colour profile segments (APP2, ICC_PROFILE), joined, if it has any. */
export function iccSegments(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== SOI) return undefined
  const found: Uint8Array[] = []
  let at = 2
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]
    if (marker === SOS || marker === EOI) break
    const end = at + 2 + ((bytes[at + 2] << 8) | bytes[at + 3])
    if (end > bytes.length) return undefined
    const name = String.fromCharCode(...bytes.subarray(at + 4, at + 15))
    if (marker === APP2 && name === 'ICC_PROFILE') {
      found.push(bytes.subarray(at, end))
    }
    at = end
  }
  if (!found.length) return undefined
  const joined = new Uint8Array(
    found.reduce((sum, part) => sum + part.length, 0),
  )
  let offset = 0
  for (const part of found) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}

/** A JPEG with a colour profile put in after its start (and its JFIF, if any). */
export function withProfile(jpeg: Uint8Array, segments: Uint8Array) {
  let at = 2
  if (jpeg[2] === 0xff && jpeg[3] === APP0) {
    at += 2 + ((jpeg[4] << 8) | jpeg[5])
  }
  const out = new Uint8Array(jpeg.length + segments.length)
  out.set(jpeg.subarray(0, at))
  out.set(segments, at)
  out.set(jpeg.subarray(at), at + segments.length)
  return out
}
