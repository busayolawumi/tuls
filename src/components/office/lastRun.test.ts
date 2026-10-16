import { describe, expect, it } from 'vitest'
import { closedWhileConverting, markConverting, markDone } from './lastRun'

function fakeStorage() {
  const items = new Map<string, string>()
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items,
  }
}

describe('noticing a page that closed mid-conversion', () => {
  it('says so once, after a conversion that never finished', () => {
    const store = fakeStorage()
    markConverting(store, 1_000)
    expect(closedWhileConverting(store, 5_000)).toBe(true)
    expect(closedWhileConverting(store, 6_000)).toBe(false)
  })

  it('stays quiet after a conversion that finished', () => {
    const store = fakeStorage()
    markConverting(store, 1_000)
    markDone(store)
    expect(closedWhileConverting(store, 5_000)).toBe(false)
  })

  it('forgets after a day', () => {
    const store = fakeStorage()
    markConverting(store, 0)
    expect(closedWhileConverting(store, 25 * 60 * 60 * 1000)).toBe(false)
  })

  it('keeps only the time', () => {
    const store = fakeStorage()
    markConverting(store, 1_234)
    expect([...store.items.values()]).toEqual(['1234'])
  })

  it('copes with storage that refuses', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => markConverting(broken)).not.toThrow()
    expect(() => markDone(broken)).not.toThrow()
    expect(closedWhileConverting(broken)).toBe(false)
    expect(closedWhileConverting(undefined)).toBe(false)
  })
})
