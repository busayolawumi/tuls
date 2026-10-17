import { describe, expect, it } from 'vitest'
import { progressRatio, progressReader, type Progress } from './progress'

describe('reading pdf2docx’s progress', () => {
  it('follows its log, reading the pages and then writing them', () => {
    const seen: Progress[] = []
    const read = progressReader((progress) => seen.push(progress))
    for (const line of [
      '[INFO] Start to convert /input.pdf',
      '[INFO] \u001b[1;36m[1/4] Opening document...\u001b[0m',
      '[INFO] \u001b[1;36m[3/4] Parsing pages...\u001b[0m',
      '[INFO] (1/2) Page 1',
      '[WARNING] Ignore Line "x" due to overlap',
      '[INFO] (2/2) Page 2',
      '[INFO] \u001b[1;36m[4/4] Creating pages...\u001b[0m',
      '[INFO] (1/2) Page 1',
      '[INFO] (2/2) Page 2',
      '[INFO] Terminated in 0.42s.',
    ]) {
      read(line)
    }
    expect(seen).toEqual([
      { phase: 'reading', page: 1, pages: 2 },
      { phase: 'reading', page: 2, pages: 2 },
      { phase: 'writing', page: 1, pages: 2 },
      { phase: 'writing', page: 2, pages: 2 },
    ])
  })

  it('counts reading as the first half, and writing as the second', () => {
    expect(progressRatio({ phase: 'reading', page: 1, pages: 4 })).toBe(1 / 8)
    expect(progressRatio({ phase: 'writing', page: 2, pages: 4 })).toBe(6 / 8)
    expect(progressRatio({ phase: 'writing', page: 4, pages: 4 })).toBe(1)
  })
})
