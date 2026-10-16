import { describe, expect, it } from 'vitest'
import {
  allPages,
  chosenLabel,
  imageName,
  imagesLabel,
  loadSettings,
  saveSettings,
  togglePage,
} from './images'

describe('names and labels', () => {
  it('names images after their pages', () => {
    expect(imageName('report', 2, 'jpeg')).toBe('report-page-3.jpg')
    expect(imageName('Scan', 0, 'png')).toBe('Scan-page-1.png')
  })

  it('counts images and chosen pages', () => {
    expect(imagesLabel(1)).toBe('1 image')
    expect(imagesLabel(4)).toBe('4 images')
    expect(chosenLabel(12, 12)).toBe('All 12 pages')
    expect(chosenLabel(1, 1)).toBe('1 page')
    expect(chosenLabel(3, 12)).toBe('3 of 12 pages')
    expect(chosenLabel(0, 12)).toBe('Choose at least one page.')
  })
})

describe('choosing pages', () => {
  it('starts with every page, and takes pages out and back', () => {
    const all = allPages(3)
    expect([...all]).toEqual([0, 1, 2])
    const without = togglePage(all, 1)
    expect([...without]).toEqual([0, 2])
    expect([...togglePage(without, 1)].sort()).toEqual([0, 1, 2])
  })
})

describe('settings', () => {
  it('starts with JPG at Standard, and remembers changes', () => {
    const saved = new Map<string, string>()
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    }
    expect(loadSettings(storage)).toEqual({
      format: 'jpeg',
      quality: 'standard',
    })
    saveSettings(storage, { format: 'png', quality: 'high' })
    expect(loadSettings(storage)).toEqual({ format: 'png', quality: 'high' })
  })

  it('copes with blocked storage and odd saved values', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadSettings(blocked)).toEqual({
      format: 'jpeg',
      quality: 'standard',
    })
    expect(() =>
      saveSettings(blocked, { format: 'png', quality: 'high' }),
    ).not.toThrow()
    expect(loadSettings({ getItem: () => '{"format":"tiff"}' })).toEqual({
      format: 'jpeg',
      quality: 'standard',
    })
    expect(loadSettings({ getItem: () => 'not json' })).toEqual({
      format: 'jpeg',
      quality: 'standard',
    })
  })
})
