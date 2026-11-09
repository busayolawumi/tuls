import { describe, expect, it } from 'vitest'
import {
  detailLine,
  formatFor,
  loadSettings,
  newSize,
  resizedNames,
  saveSettings,
  sizeChange,
  targetOf,
  type Settings,
} from './resize'

const settings = (more: Partial<Settings>): Settings => ({
  mode: 'percent',
  percent: '50',
  width: '',
  height: '',
  ...more,
})

describe('targetOf', () => {
  it('takes a percentage from 1 to 99', () => {
    expect(targetOf(settings({ percent: '25' }))).toEqual({ percent: 25 })
    for (const percent of ['0', '100', '', '12.5', 'abc']) {
      expect(targetOf(settings({ percent }))).toBeUndefined()
    }
  })

  it('takes a width, a height or both', () => {
    const size = (width: string, height: string) =>
      targetOf(settings({ mode: 'size', width, height }))
    expect(size('800', '')).toEqual({ width: 800 })
    expect(size('', '600')).toEqual({ height: 600 })
    expect(size('800', '600')).toEqual({ width: 800, height: 600 })
    expect(size('', '')).toBeUndefined()
    expect(size('0', '600')).toBeUndefined()
    expect(size('80x', '')).toBeUndefined()
  })
})

describe('newSize', () => {
  it('scales both sides by a percentage', () => {
    expect(newSize(4032, 3024, { percent: 50 })).toEqual({
      width: 2016,
      height: 1512,
    })
  })

  it('works out the other side from one', () => {
    expect(newSize(4000, 3000, { width: 800 })).toEqual({
      width: 800,
      height: 600,
    })
    expect(newSize(4000, 3000, { height: 300 })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('fits inside both, keeping proportions', () => {
    expect(newSize(4000, 3000, { width: 800, height: 800 })).toEqual({
      width: 800,
      height: 600,
    })
    expect(newSize(3000, 4000, { width: 800, height: 800 })).toEqual({
      width: 600,
      height: 800,
    })
  })

  it('never makes an image bigger', () => {
    expect(newSize(640, 480, { width: 800 })).toEqual({
      width: 640,
      height: 480,
    })
  })

  it('never reaches nothing', () => {
    expect(newSize(1000, 2, { percent: 1 })).toEqual({ width: 10, height: 1 })
  })
})

describe('formats and names', () => {
  const file = (name: string, type = '') => ({ name, type })

  it('keeps the format, and turns HEIC into JPG', () => {
    expect(formatFor(file('a.jpeg', 'image/jpeg'))).toBe('jpeg')
    expect(formatFor(file('a.PNG'))).toBe('png')
    expect(formatFor(file('a.webp', 'image/webp'))).toBe('webp')
    expect(formatFor(file('IMG_1.HEIC'))).toBe('jpeg')
    expect(formatFor(file('a.avif', 'image/avif'))).toBe('jpeg')
    expect(formatFor(file('a.gif', 'image/gif'))).toBe('png')
    expect(formatFor(file('a.bmp'))).toBe('png')
    expect(formatFor(file('png-photo.jpg', 'image/jpeg'))).toBe('jpeg')
    expect(formatFor(file('png-photo.jpg'))).toBe('jpeg')
  })

  it('names files, numbering matches', () => {
    expect(
      resizedNames([
        file('IMG_1.HEIC'),
        file('img_1.jpg'),
        file('logo.png'),
        file('a.webp'),
      ]),
    ).toEqual([
      'IMG_1-resized.jpg',
      'img_1-resized (2).jpg',
      'logo-resized.png',
      'a-resized.webp',
    ])
  })

  it('names a file that ends in the letter x safely', () => {
    expect(resizedNames([file('box.png')])).toEqual(['box-resized.png'])
  })

  it('says only the size when it stayed the same', () => {
    expect(
      sizeChange({ width: 64, height: 48 }, { width: 64, height: 48 }),
    ).toBe('64 × 48')
  })

  it('says what changed', () => {
    expect(
      detailLine(
        { width: 4032, height: 3024 },
        { width: 2016, height: 1512 },
        1_400_000,
        620_000,
      ),
    ).toBe('4032 × 3024 → 2016 × 1512 · 1.4 MB → 620 KB')
  })
})

describe('the settings, remembered', () => {
  const store = (value: string | null) => ({ getItem: () => value })

  it('starts at 50%', () => {
    expect(loadSettings(undefined)).toEqual(settings({}))
    expect(loadSettings(store(null))).toEqual(settings({}))
  })

  it('keeps a choice', () => {
    let saved = ''
    const chosen = settings({ mode: 'size', width: '1200' })
    saveSettings(
      {
        setItem: (_, value) => {
          saved = value
        },
      },
      chosen,
    )
    expect(loadSettings(store(saved))).toEqual(chosen)
  })

  it('ignores odd or blocked storage', () => {
    expect(loadSettings(store('{oops'))).toEqual(settings({}))
    expect(loadSettings(store('{"mode":"x","percent":7,"width":"a"}'))).toEqual(
      settings({}),
    )
    expect(
      loadSettings({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toEqual(settings({}))
    expect(() =>
      saveSettings(
        {
          setItem: () => {
            throw new Error('blocked')
          },
        },
        settings({}),
      ),
    ).not.toThrow()
  })
})
