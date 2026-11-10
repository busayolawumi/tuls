import { describe, expect, it } from 'vitest'
import {
  compressedNames,
  loadSettings,
  saveSettings,
  sizeNote,
  underBytes,
} from './compress'

describe('underBytes', () => {
  it('reads megabytes, with a point or a comma', () => {
    expect(underBytes('2')).toBe(2_000_000)
    expect(underBytes('0.5')).toBe(500_000)
    expect(underBytes('2,5')).toBe(2_500_000)
    expect(underBytes('0.05')).toBe(50_000)
    expect(underBytes('100')).toBe(100_000_000)
  })

  it('turns down sizes it can’t take', () => {
    for (const text of ['', '0', '0.01', '101', '1.2.3', 'abc', '1.234']) {
      expect(underBytes(text)).toBeUndefined()
    }
  })
})

describe('names and notes', () => {
  it('names files after their originals', () => {
    expect(
      compressedNames([
        { name: 'IMG_1.HEIC', type: '' },
        { name: 'shot.png', type: 'image/png' },
        { name: 'img_1.jpg', type: 'image/jpeg' },
      ]),
    ).toEqual([
      'IMG_1-compressed.jpg',
      'shot-compressed.png',
      'img_1-compressed (2).jpg',
    ])
  })

  it('says why a picture was made smaller', () => {
    expect(sizeNote(2000, 1500, 'under', 1_000_000)).toBe(
      'Made 2000 × 1500 to fit under 1 MB.',
    )
    expect(sizeNote(2560, 1920, 'smallest', undefined)).toBe(
      'Made 2560 × 1920, as Smallest does with very big pictures.',
    )
  })
})

describe('the settings, remembered', () => {
  const store = (value: string | null) => ({ getItem: () => value })
  const defaults = { choice: 'recommended', under: '1' }

  it('starts at Recommended', () => {
    expect(loadSettings(undefined)).toEqual(defaults)
    expect(loadSettings(store(null))).toEqual(defaults)
  })

  it('keeps a choice', () => {
    let saved = ''
    saveSettings(
      {
        setItem: (_, value) => {
          saved = value
        },
      },
      { choice: 'under', under: '0,5' },
    )
    expect(loadSettings(store(saved))).toEqual({
      choice: 'under',
      under: '0,5',
    })
  })

  it('ignores odd or blocked storage', () => {
    expect(loadSettings(store('{oops'))).toEqual(defaults)
    expect(loadSettings(store('{"choice":"huge","under":5}'))).toEqual(defaults)
    expect(
      loadSettings({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toEqual(defaults)
  })
})
