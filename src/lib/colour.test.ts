import { zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { isDisplayP3, p3ToSrgb } from './colour'

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
const utf16 = (text: string) => [...text].flatMap((c) => [0, c.charCodeAt(0)])

function heifWithNclx(primaries: number) {
  return new Uint8Array([
    ...[0, 0, 0, 24, ...ascii('ftypheic')],
    ...[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ...[0, 0, 0, 19, ...ascii('colrnclx'), 0, primaries, 0, 13, 0, 6, 0x80],
  ])
}

function pngWithProfile(profile: number[]) {
  const data = [...ascii('icc'), 0, 0, ...zlibSync(new Uint8Array(profile))]
  const length = data.length
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...[0, 0, 0, 13, ...ascii('IHDR'), ...new Array(13).fill(0), 0, 0, 0, 0],
    ...[
      length >>> 24,
      (length >>> 16) & 255,
      (length >>> 8) & 255,
      length & 255,
    ],
    ...ascii('iCCP'),
    ...data,
    0,
    0,
    0,
    0,
  ])
}

describe('spotting Display P3', () => {
  it('reads HEIC’s own colour description', async () => {
    expect(await isDisplayP3(heifWithNclx(12))).toBe(true)
    expect(await isDisplayP3(heifWithNclx(1))).toBe(false)
  })

  it('finds a Display P3 profile, as Apple names it, in JPEG or WebP', async () => {
    const jpeg = new Uint8Array([
      0xff,
      0xd8,
      ...ascii('ICC_PROFILE'),
      0,
      ...utf16('Display P3'),
    ])
    expect(await isDisplayP3(jpeg)).toBe(true)
    expect(
      await isDisplayP3(new Uint8Array([0xff, 0xd8, ...utf16('sRGB IEC')])),
    ).toBe(false)
  })

  it('looks inside a PNG’s compressed profile', async () => {
    expect(
      await isDisplayP3(pngWithProfile([1, 2, ...utf16('Display P3'), 3])),
    ).toBe(true)
    expect(await isDisplayP3(pngWithProfile(utf16('sRGB')))).toBe(false)
  })
})

describe('Display P3 to sRGB', () => {
  it('matches what browsers draw', () => {
    // Chrome, Safari and Firefox all draw display-p3 (128, 160, 60) as sRGB
    // (119, 161, 36).
    const pixels = new Uint8ClampedArray([128, 160, 60, 255, 255, 255, 255, 7])
    p3ToSrgb(pixels)
    for (const [v, want] of [
      [pixels[0], 119],
      [pixels[1], 161],
      [pixels[2], 36],
    ]) {
      expect(Math.abs(v - want)).toBeLessThanOrEqual(1)
    }
    expect([...pixels.slice(4)]).toEqual([255, 255, 255, 7])
  })

  it('clips colours sRGB can’t show', () => {
    const red = p3ToSrgb(new Uint8ClampedArray([255, 0, 0, 255]))
    expect([...red]).toEqual([255, 0, 0, 255])
  })
})
