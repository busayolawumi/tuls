const ASCII = new TextEncoder().encode('Display P3')
const UTF16 = new Uint8Array([...ASCII].flatMap((byte) => [0, byte]))
const SCAN = 2_000_000

function indexOf(bytes: Uint8Array, needle: Uint8Array, from = 0) {
  const last = bytes.length - needle.length
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}

const text = (value: string) => new TextEncoder().encode(value)

/** Whether an ICC profile, or bytes holding one, names Display P3. */
function namesP3(bytes: Uint8Array) {
  return indexOf(bytes, UTF16) >= 0 || indexOf(bytes, ASCII) >= 0
}

async function inflate(data: Uint8Array) {
  const stream = new Blob([data.slice()])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A PNG's colour profile, which PNGs keep compressed in an iCCP chunk. */
async function pngProfile(bytes: Uint8Array) {
  const at = indexOf(bytes.subarray(0, SCAN), text('iCCP'))
  if (at < 4) return undefined
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at - 4)
  const chunk = bytes.subarray(at + 4, at + 4 + length)
  const nameEnd = chunk.indexOf(0)
  if (nameEnd < 0) return undefined
  return inflate(chunk.subarray(nameEnd + 2))
}

/**
 * Whether an image is in Display P3, the wider colours iPhones and Macs
 * use: an ICC profile by that name (JPEG, PNG, WebP, HEIC), or HEIC's own
 * colour description with P3 primaries.
 */
export async function isDisplayP3(bytes: Uint8Array) {
  const head = bytes.subarray(0, SCAN)
  const colr = indexOf(head, text('colrnclx'))
  if (colr >= 0) {
    const primaries = (head[colr + 8] << 8) | head[colr + 9]
    return primaries === 12 || primaries === 11
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    const profile = await pngProfile(bytes).catch(() => undefined)
    return profile ? namesP3(profile) : false
  }
  return namesP3(head)
}

let p3Canvas: boolean | undefined

/** Whether this browser can draw and save in Display P3 (not Firefox). */
export function canvasCanKeepP3() {
  if (p3Canvas === undefined) {
    try {
      new ImageData(1, 1, { colorSpace: 'display-p3' })
      const context = document
        .createElement('canvas')
        .getContext('2d', { colorSpace: 'display-p3' })
      p3Canvas = context?.getContextAttributes().colorSpace === 'display-p3'
    } catch {
      p3Canvas = false
    }
  }
  return p3Canvas
}

const toLinear = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const v = i / 255
  toLinear[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const LEVELS = 4096
const toEncoded = new Uint8ClampedArray(LEVELS + 1)
for (let i = 0; i <= LEVELS; i++) {
  const v = i / LEVELS
  toEncoded[i] = Math.round(
    255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055),
  )
}

// Display P3 to sRGB, in linear light (both use sRGB's tone curve).
const M = [
  [1.2249401, -0.2249404, 0],
  [-0.0420569, 1.0420571, 0],
  [-0.0196376, -0.0786361, 1.0982735],
]

const level = (v: number) =>
  toEncoded[Math.round(Math.min(1, Math.max(0, v)) * LEVELS)]

/** Converts RGBA pixels from Display P3 to sRGB, in place. */
export function p3ToSrgb(pixels: Uint8ClampedArray) {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = toLinear[pixels[i]]
    const g = toLinear[pixels[i + 1]]
    const b = toLinear[pixels[i + 2]]
    pixels[i] = level(M[0][0] * r + M[0][1] * g + M[0][2] * b)
    pixels[i + 1] = level(M[1][0] * r + M[1][1] * g + M[1][2] * b)
    pixels[i + 2] = level(M[2][0] * r + M[2][1] * g + M[2][2] * b)
  }
  return pixels
}
