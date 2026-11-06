import { describe, expect, it } from 'vitest'
import {
  checkImage,
  formatOf,
  imagesLabel,
  loadPageSize,
  MAX_IMAGE_SIZE,
  pdfName,
  savePageSize,
} from './images'

// checkImage only reads the name, type and size.
const file = (name: string, type: string, size = 100_000) =>
  ({ name, type, size }) as File

describe('checkImage', () => {
  it('accepts images, by type or by name', () => {
    expect(checkImage(file('a.jpg', 'image/jpeg'))).toBeUndefined()
    expect(checkImage(file('IMG_1234.HEIC', ''))).toBeUndefined()
    expect(checkImage(file('sticker.webp', 'image/webp'))).toBeUndefined()
  })

  it('turns down other files, and images that are too big', () => {
    expect(checkImage(file('notes.txt', 'text/plain'))).toBe(
      'That isn’t an image Tuls can use. Try a JPG, PNG, WebP, GIF or HEIC.',
    )
    expect(checkImage(file('logo.svg', 'image/svg+xml'))).toMatch(/^That isn’t/)
    expect(checkImage(file('huge.jpg', 'image/jpeg', MAX_IMAGE_SIZE + 1))).toBe(
      'That image is 50 MB. Each image can be up to 50 MB.',
    )
  })
})

describe('formatOf', () => {
  it('knows JPEGs and PNGs by their first bytes', () => {
    expect(formatOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
    expect(
      formatOf(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('png')
    expect(formatOf(new TextEncoder().encode('RIFF....WEBP'))).toBeUndefined()
  })
})

describe('names and labels', () => {
  it('names the PDF after the first image', () => {
    expect(pdfName('IMG_1234.jpg')).toBe('IMG_1234.pdf')
    expect(pdfName('scan.final.png')).toBe('scan.final.pdf')
    expect(pdfName('.png')).toBe('images.pdf')
  })

  it('counts images', () => {
    expect(imagesLabel(1)).toBe('1 image')
    expect(imagesLabel(3)).toBe('3 images')
  })
})

describe('page size', () => {
  it('starts with the image’s own size, and remembers the last choice', () => {
    const saved = new Map<string, string>()
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    }
    expect(loadPageSize(storage)).toBe('fit')
    savePageSize(storage, 'a4')
    expect(loadPageSize(storage)).toBe('a4')
  })

  it('copes without storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadPageSize(blocked)).toBe('fit')
    expect(() => savePageSize(blocked, 'a4')).not.toThrow()
    expect(loadPageSize(undefined)).toBe('fit')
  })

  it('ignores a saved value it doesn’t know', () => {
    const storage = { getItem: () => 'tabloid' }
    expect(loadPageSize(storage)).toBe('fit')
  })
})
