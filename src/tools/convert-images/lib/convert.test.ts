import { describe, expect, it } from 'vitest'
import { fitPixels, isHeifData, PHONE_PIXELS } from '../../../lib/picture'
import {
  imageNames,
  listLine,
  loadFormat,
  saveFormat,
  sizeLine,
} from './convert'

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

describe('names and lines', () => {
  it('names each new image after its original', () => {
    expect(
      imageNames(['IMG_1234.HEIC', 'IMG_1234.heic', 'scan.png'], 'jpeg'),
    ).toEqual(['IMG_1234.jpg', 'IMG_1234 (2).jpg', 'scan.jpg'])
    expect(imageNames(['a.jpg'], 'webp')).toEqual(['a.webp'])
  })

  it('says the size and both file sizes', () => {
    expect(sizeLine(4032, 3024, 1_400_000, 2_600_000)).toBe(
      '4032 × 3024 · 1.4 MB → 2.6 MB',
    )
    expect(listLine(4032, 3024, 1_400_000)).toBe('4032 × 3024 · from 1.4 MB')
  })
})

describe('the format, remembered', () => {
  it('starts with JPG, and keeps a choice', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    expect(loadFormat(storage)).toBe('jpeg')
    saveFormat(storage, 'webp')
    expect(loadFormat(storage)).toBe('webp')
    store.set('tuls:convert-images:format', 'gif')
    expect(loadFormat(storage)).toBe('jpeg')
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadFormat(blocked)).toBe('jpeg')
  })
})

describe('pictures', () => {
  it('knows HEIF files by their brand', () => {
    const heif = (brand: string) =>
      new Uint8Array([0, 0, 0, 24, ...ascii(`ftyp${brand}`), 0, 0, 0, 0])
    expect(isHeifData(heif('heic'))).toBe(true)
    expect(isHeifData(heif('mif1'))).toBe(true)
    expect(isHeifData(heif('avif'))).toBe(false)
    expect(isHeifData(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false)
  })

  it('fits big photos to what a phone can make, keeping their shape', () => {
    expect(fitPixels(4032, 3024, PHONE_PIXELS)).toEqual({
      width: 4032,
      height: 3024,
    })
    const fitted = fitPixels(8064, 6048, PHONE_PIXELS)
    expect(fitted.width * fitted.height).toBeLessThanOrEqual(PHONE_PIXELS)
    expect(fitted.width / fitted.height).toBeCloseTo(8064 / 6048, 2)
  })
})
