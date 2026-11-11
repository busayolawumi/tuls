import { describe, expect, it } from 'vitest'
import {
  chooseTurn,
  defaultLanguage,
  hasReadableText,
  loadLanguage,
  outcomeNotes,
  readerCount,
  saveLanguage,
  textOnLabel,
  timeLeft,
  toReadLabel,
  tooManyToRead,
} from './ocr'

describe('readers side by side', () => {
  it('uses one on a phone, and up to four on a computer, leaving a core free', () => {
    expect(readerCount(30, true, 8)).toBe(1)
    expect(readerCount(30, false, 8)).toBe(4)
    expect(readerCount(30, false, 4)).toBe(3)
    expect(readerCount(30, false, 2)).toBe(1)
    expect(readerCount(2, false, 8)).toBe(2)
  })
})

describe('which way up', () => {
  it('keeps a page as it is unless another way reads clearly better', () => {
    expect(chooseTurn([40, 85, 20, 18])).toBe(1)
    expect(chooseTurn([20, 18, 30, 90])).toBe(3)
    expect(chooseTurn([45, 52, 20, 18])).toBe(0)
    expect(chooseTurn([10, 30, 44, 20])).toBe(0)
    expect(chooseTurn([0, 0, 0, 0])).toBe(0)
  })

  it('counts a read as text only with words, read with some confidence', () => {
    expect(hasReadableText({ words: 40, confidence: 80 })).toBe(true)
    expect(hasReadableText({ words: 3, confidence: 12 })).toBe(false)
    expect(hasReadableText({ words: 0, confidence: 95 })).toBe(false)
  })
})

describe('time left', () => {
  it('waits for a page or two before guessing', () => {
    expect(timeLeft(0, 20, 10_000)).toBeUndefined()
    expect(timeLeft(1, 20, 1000)).toBeUndefined()
    expect(timeLeft(20, 20, 60_000)).toBeUndefined()
  })

  it('rounds to minutes, or says it’s under one', () => {
    expect(timeLeft(2, 20, 10_000)).toBe('About 2 minutes left')
    expect(timeLeft(10, 20, 30_000)).toBe('Less than a minute left')
    expect(timeLeft(5, 20, 20_000)).toBe('About a minute left')
    expect(timeLeft(1, 200, 5000)).toBe('About 17 minutes left')
  })
})

describe('the language', () => {
  const store = (value: string | null) => {
    const saved: Record<string, string> = {}
    return {
      saved,
      getItem: () => value,
      setItem: (key: string, v: string) => (saved[key] = v),
    }
  }

  it('starts as the browser’s language, if Tuls can read it', () => {
    expect(defaultLanguage(['fr-FR', 'en'])).toBe('fra')
    expect(defaultLanguage(['yo-NG'])).toBe('yor')
    expect(defaultLanguage(['ha-NG', 'en-GB'])).toBe('eng')
    expect(defaultLanguage(['ja'])).toBe('eng')
    expect(defaultLanguage([])).toBe('eng')
  })

  it('remembers the last choice, and ignores anything odd', () => {
    expect(loadLanguage(store('deu'), ['fr'])).toBe('deu')
    expect(loadLanguage(store('klingon'), ['fr'])).toBe('fra')
    expect(
      loadLanguage(
        {
          getItem: () => {
            throw new Error('blocked')
          },
        },
        [],
      ),
    ).toBe('eng')
    const saving = store(null)
    saveLanguage(saving, 'yor')
    expect(saving.saved).toEqual({ 'tuls:ocr-pdf:language': 'yor' })
    expect(() =>
      saveLanguage(
        {
          setItem: () => {
            throw new Error('full')
          },
        },
        'eng',
      ),
    ).not.toThrow()
  })
})

describe('what the page says', () => {
  it('counts the pages to read', () => {
    expect(toReadLabel(14, 3)).toBe('3 of 14 pages to read')
    expect(toReadLabel(14, 14)).toBe('All 14 pages to read')
    expect(toReadLabel(1, 1)).toBe('1 page to read')
  })

  it('says how many scanned pages fit', () => {
    expect(tooManyToRead(80, true)).toMatch(
      /^It has 80 scanned pages\. On a phone, up to 50/,
    )
    expect(tooManyToRead(250, false)).toMatch(/Up to 200 can be read at once/)
  })

  it('sums up a PDF’s pages', () => {
    expect(
      outcomeNotes({ pages: 3, read: [1, 2, 3], turned: [], unreadable: [] }),
    ).toEqual(['Text added to all 3 pages.'])
    expect(
      outcomeNotes({ pages: 2, read: [1, 2], turned: [], unreadable: [] }),
    ).toEqual(['Text added to both pages.'])
    expect(
      outcomeNotes({ pages: 1, read: [1], turned: [1], unreadable: [] }),
    ).toEqual([
      'Text added.',
      'Page 1 was sideways or upside down, so it’s been turned the right way up.',
    ])
    expect(
      outcomeNotes({
        pages: 14,
        read: [2, 3, 4, 7],
        turned: [3, 7],
        unreadable: [9],
      }),
    ).toEqual([
      'Text added to pages 2–4 and 7.',
      '9 pages had text already.',
      'Pages 3 and 7 were sideways or upside down, so they’ve been turned the right way up.',
      'No text could be read on page 9: it may be a picture, or too faint to read.',
    ])
  })

  it('labels a result in a list', () => {
    expect(textOnLabel(12, 14)).toBe('Text on 12 of 14 pages')
    expect(textOnLabel(5, 5)).toBe('Text on all 5 pages')
    expect(textOnLabel(1, 1)).toBe('Text on its page')
    expect(textOnLabel(2, 2)).toBe('Text on both pages')
  })
})
