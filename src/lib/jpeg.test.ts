import { describe, expect, it } from 'vitest'
import { cleanJpeg } from './jpeg'
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
