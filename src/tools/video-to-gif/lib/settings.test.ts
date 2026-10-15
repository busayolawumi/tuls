import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadSettings,
  maxCustomSize,
  outputDimensions,
  qualityOf,
  saveSettings,
} from './settings'

const KEY = 'tuls:video-to-gif:settings'

/** A stand-in for the browser's localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('qualityOf', () => {
  it('uses the preset’s size and frame rate', () => {
    expect(
      qualityOf({ preset: 'Balanced', custom: { size: 600, fps: 20 } }),
    ).toEqual({ size: 480, fps: 15 })
  })

  it('never makes a custom GIF bigger than the video', () => {
    const settings = {
      preset: 'Custom' as const,
      custom: { size: 1000, fps: 24 },
    }
    expect(qualityOf(settings, { width: 640, height: 360 })).toEqual({
      size: 640,
      fps: 24,
    })
  })
})

describe('maxCustomSize', () => {
  it('is the video’s longer side, between 160 and 1080', () => {
    expect(maxCustomSize()).toBe(1080)
    expect(maxCustomSize({ width: 300, height: 200 })).toBe(300)
    expect(maxCustomSize({ width: 4000, height: 3000 })).toBe(1080)
    expect(maxCustomSize({ width: 100, height: 50 })).toBe(160)
  })
})

describe('outputDimensions', () => {
  it('fits the longer side to the size', () => {
    expect(outputDimensions({ width: 1920, height: 1080 }, 480)).toEqual({
      width: 480,
      height: 270,
    })
    expect(outputDimensions({ width: 1080, height: 1920 }, 480)).toEqual({
      width: 270,
      height: 480,
    })
  })

  it('never scales a small video up', () => {
    expect(outputDimensions({ width: 320, height: 240 }, 480)).toEqual({
      width: 320,
      height: 240,
    })
  })
})

describe('loadSettings', () => {
  it('starts on Balanced when nothing is saved', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    expect(loadSettings().preset).toBe('Balanced')
  })

  it('brings back a saved choice, keeping custom values in range', () => {
    vi.stubGlobal(
      'localStorage',
      fakeStorage({
        [KEY]: JSON.stringify({
          preset: 'Custom',
          custom: { size: 5000, fps: 100 },
        }),
      }),
    )
    expect(loadSettings()).toEqual({
      preset: 'Custom',
      custom: { size: 1080, fps: 30 },
    })
  })

  it('falls back to Balanced for broken or unknown data', () => {
    for (const saved of [
      'not json',
      '{"preset":"Huge"}',
      '{"preset":"High"}',
    ]) {
      vi.stubGlobal('localStorage', fakeStorage({ [KEY]: saved }))
      expect(loadSettings().preset).toBe('Balanced')
    }
  })

  it('falls back to Balanced when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadSettings().preset).toBe('Balanced')
  })
})

describe('saveSettings', () => {
  it('remembers the choice under the tool’s own key', () => {
    const storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    saveSettings({ preset: 'High', custom: { size: 600, fps: 20 } })
    expect(JSON.parse(storage.items.get(KEY)!).preset).toBe('High')
  })

  it('doesn’t fail when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() =>
      saveSettings({ preset: 'High', custom: { size: 600, fps: 20 } }),
    ).not.toThrow()
  })
})
