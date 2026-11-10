import { describe, expect, it } from 'vitest'
import { cleanJpeg, iccSegments, withProfile } from './jpeg'
import { exifSegment, segment, TINY_JPEG, withSegments } from './images.testing'

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1')

/** Where the picture data (SOS) starts. */
const sos = (bytes: Uint8Array) => text(bytes).indexOf('\xff\xda')

describe('cleanJpeg', () => {
  it('reads the orientation, in either byte order', () => {
    for (const little of [false, true]) {
      const jpeg = withSegments(TINY_JPEG, [
        exifSegment({ orientation: 6, little }),
      ])
      expect(cleanJpeg(jpeg).orientation).toBe(6)
    }
  })

  it('takes upright when there’s no orientation, or it’s nonsense', () => {
    expect(cleanJpeg(TINY_JPEG).orientation).toBe(1)
    const odd = withSegments(TINY_JPEG, [exifSegment({ orientation: 9 })])
    expect(cleanJpeg(odd).orientation).toBe(1)
  })

  it('removes EXIF, XMP, IPTC and comments', () => {
    const jpeg = withSegments(TINY_JPEG, [
      exifSegment({ orientation: 1, note: 'GPS 6.5244N 3.3792E' }),
      segment(
        0xe1,
        'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Someone</x:xmpmeta>',
      ),
      segment(0xed, 'Photoshop 3.0\0IPTC: by Someone'),
      segment(0xfe, 'Taken on a Pixel'),
    ])
    const clean = text(cleanJpeg(jpeg).bytes)
    for (const detail of [
      'GPS',
      'Exif',
      'xmpmeta',
      'IPTC',
      'Pixel',
      'Someone',
    ]) {
      expect(clean).not.toContain(detail)
    }
  })

  it('keeps the colour profile, and the picture byte for byte', () => {
    const jpeg = withSegments(TINY_JPEG, [exifSegment({ orientation: 3 })])
    const clean = cleanJpeg(jpeg).bytes
    expect(text(clean)).toContain('ICC_PROFILE')
    expect(text(clean)).toContain('JFIF')
    expect(clean.subarray(sos(clean))).toEqual(
      TINY_JPEG.subarray(sos(TINY_JPEG)),
    )
  })

  it('turns down what isn’t a JPEG, or is cut short', () => {
    expect(() => cleanJpeg(new TextEncoder().encode('not a jpeg'))).toThrow(
      'Not a JPEG',
    )
    expect(() => cleanJpeg(TINY_JPEG.subarray(0, 30))).toThrow('Damaged JPEG')
  })
})

describe('colour profiles', () => {
  // The test JPEG has Chrome's own sRGB profile; these start without one.
  const own = iccSegments(TINY_JPEG)!
  const at = TINY_JPEG.findIndex((_, i) =>
    own.every((byte, j) => TINY_JPEG[i + j] === byte),
  )
  const bare = new Uint8Array([
    ...TINY_JPEG.subarray(0, at),
    ...TINY_JPEG.subarray(at + own.length),
  ])
  const profile = segment(0xe2, 'ICC_PROFILE\0\x01\x01made-up profile')
  const exif = segment(0xe1, 'Exif\0\0details')

  it('finds a JPEG’s profile segments, and nothing else', () => {
    const jpeg = withSegments(bare, [exif, profile])
    expect(iccSegments(jpeg)).toEqual(profile)
    expect(iccSegments(bare)).toBeUndefined()
    expect(own.length).toBeGreaterThan(100)
    expect(iccSegments(new Uint8Array([1, 2, 3]))).toBeUndefined()
  })

  it('puts a profile in after the JFIF segment, keeping the picture', () => {
    const made = withProfile(bare, profile)
    expect(made.length).toBe(bare.length + profile.length)
    expect(iccSegments(made)).toEqual(profile)
    expect(cleanJpeg(made).bytes).toEqual(made)
    expect(bare[3]).toBe(0xe0)
    const jfifEnd = 4 + ((bare[4] << 8) | bare[5])
    expect(made.subarray(jfifEnd, jfifEnd + 2)).toEqual(
      new Uint8Array([0xff, 0xe2]),
    )
  })
})
