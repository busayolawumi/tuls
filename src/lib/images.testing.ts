// Test images, made by code (the JPEG once, with Chrome's canvas), never
// anyone's real photos. For the unit tests and the browser tests, so only
// standard web features are used here.

/**
 * An 8 × 4 JPEG, red on the left and blue on the right, as Chrome's canvas
 * saves it: with JFIF and a colour profile, like most JPEGs.
 */
export const TINY_JPEG = fromBase64(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRy' +
    'UkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA' +
    '9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAA' +
    'ABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0' +
    'AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAA' +
    'b6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVog' +
    'AAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAA' +
    'AABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAg' +
    'ADIAMAAxADb/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4R' +
    'DgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQU' +
    'FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAEAAgDASIAAhEB' +
    'AxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAYEAEAAwEAAAAAAAAAAAAAAAAAB0WDwv/E' +
    'ABUBAQEAAAAAAAAAAAAAAAAAAAYI/8QAGxEAAAcBAAAAAAAAAAAAAAAAAAMEBzaDswX/2gAM' +
    'AwEAAhEDEQA/AI2lWr14AXCyUA51u5gVu/N19eJY/9k=',
)

/** A JPEG segment: 0xFF, its marker, its length, then the data. */
export function segment(marker: number, data: string | Uint8Array) {
  const body = typeof data === 'string' ? latin1(data) : data
  const length = body.length + 2
  return concat(
    new Uint8Array([0xff, marker, length >> 8, length & 0xff]),
    body,
  )
}

/**
 * An EXIF segment (APP1) with an orientation and, if given, a note in the
 * ImageDescription tag, standing in for details like a location.
 */
export function exifSegment({
  orientation,
  little = false,
  note,
}: {
  orientation: number
  little?: boolean
  note?: string
}) {
  const text = note === undefined ? undefined : latin1(`${note}\0`)
  const entries = text ? 2 : 1
  const listEnd = 8 + 2 + entries * 12 + 4
  const tiff = new DataView(new ArrayBuffer(listEnd + (text?.length ?? 0)))
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, little)
  tiff.setUint32(4, 8, little)
  tiff.setUint16(8, entries, little)
  let entry = 10
  if (text) {
    // ImageDescription (0x010E): text, kept after the list.
    tiff.setUint16(entry, 0x010e, little)
    tiff.setUint16(entry + 2, 2, little)
    tiff.setUint32(entry + 4, text.length, little)
    tiff.setUint32(entry + 8, listEnd, little)
    entry += 12
  }
  // Orientation (0x0112): one number, kept in the entry itself.
  tiff.setUint16(entry, 0x0112, little)
  tiff.setUint16(entry + 2, 3, little)
  tiff.setUint32(entry + 4, 1, little)
  tiff.setUint16(entry + 8, orientation, little)
  const bytes = new Uint8Array(tiff.buffer)
  if (text) bytes.set(text, listEnd)
  return segment(0xe1, concat(latin1('Exif\0\0'), bytes))
}

/** The JPEG with these segments added straight after its start. */
export function withSegments(jpeg: Uint8Array, segments: Uint8Array[]) {
  return concat(jpeg.subarray(0, 2), ...segments, jpeg.subarray(2))
}

/**
 * A PNG of one colour (see-through if `alpha`), with a text chunk if given,
 * which is where apps keep details.
 */
export async function makePng(
  width: number,
  height: number,
  { note, alpha = false }: { note?: string; alpha?: boolean } = {},
) {
  const channels = alpha ? 4 : 3
  const rowLength = 1 + width * channels // each row starts with a filter byte
  const pixels = new Uint8Array(height * rowLength)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels.set(
        alpha ? [0, 128, 0, 128] : [0, 128, 0],
        y * rowLength + 1 + x * channels,
      )
    }
  }
  const header = new DataView(new ArrayBuffer(13))
  header.setUint32(0, width)
  header.setUint32(4, height)
  header.setUint8(8, 8) // bits per channel
  header.setUint8(9, alpha ? 6 : 2) // RGBA or RGB
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', new Uint8Array(header.buffer)),
    ...(note === undefined ? [] : [chunk('tEXt', latin1(`Comment\0${note}`))]),
    chunk('IDAT', await deflate(pixels)),
    chunk('IEND', new Uint8Array()),
  )
}

function chunk(type: string, data: Uint8Array) {
  const length = new DataView(new ArrayBuffer(4))
  length.setUint32(0, data.length)
  const typed = concat(latin1(type), data)
  const crc = new DataView(new ArrayBuffer(4))
  crc.setUint32(0, crc32(typed))
  return concat(
    new Uint8Array(length.buffer),
    typed,
    new Uint8Array(crc.buffer),
  )
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function deflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function latin1(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}

function fromBase64(base64: string) {
  return latin1(atob(base64))
}

function concat(...parts: Uint8Array[]) {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    all.set(part, offset)
    offset += part.length
  }
  return all
}
