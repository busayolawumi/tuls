import { describe, expect, it } from 'vitest'
import {
  isWorthIt,
  loadLevel,
  saveLevel,
  savingDetail,
  savingLine,
  smaller,
} from './compress'

describe('isWorthIt', () => {
  it('needs at least 5% off', () => {
    expect(isWorthIt(1000, 950)).toBe(true)
    expect(isWorthIt(1000, 951)).toBe(false)
    expect(isWorthIt(1000, 1200)).toBe(false)
  })
})

describe('the savings, in words', () => {
  it('says how much smaller', () => {
    expect(smaller(7_000_000, 1_820_000)).toBe('74% smaller')
    // Never "0%" or "100%".
    expect(smaller(1000, 999)).toBe('1% smaller')
    expect(smaller(10_000_000, 1)).toBe('99% smaller')
    expect(savingLine(7_000_000, 1_820_000)).toMatch(
      /^7(\.0)? MB → 1\.8 MB, 74% smaller$/,
    )
    expect(savingDetail(7_000_000, 1_820_000)).toMatch(
      /^74% smaller, from 7(\.0)? MB$/,
    )
  })
})

describe('the level', () => {
  it('is Recommended unless Smallest was chosen', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }
    expect(loadLevel(storage)).toBe('recommended')
    saveLevel(storage, 'smallest')
    expect(loadLevel(storage)).toBe('smallest')
    store.set('tuls:compress-pdf:level', 'something else')
    expect(loadLevel(storage)).toBe('recommended')
  })

  it('copes with blocked storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadLevel(blocked)).toBe('recommended')
    expect(() => saveLevel(blocked, 'smallest')).not.toThrow()
    expect(loadLevel(undefined)).toBe('recommended')
  })
})
