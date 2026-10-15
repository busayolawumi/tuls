import { describe, expect, it } from 'vitest'
import { formatSize, formatTime } from './format'

describe('formatSize', () => {
  it('counts the way phones and Macs do (1 MB = 1,000,000 bytes)', () => {
    expect(formatSize(1)).toBe('1 KB')
    expect(formatSize(999)).toBe('1 KB')
    expect(formatSize(228_343)).toBe('228 KB')
    expect(formatSize(1_500_000)).toBe('1.5 MB')
    expect(formatSize(2_000_000)).toBe('2 MB')
    expect(formatSize(1_230_000_000)).toBe('1.2 GB')
  })
})

describe('formatTime', () => {
  it('shows m:ss.s, with hours for long videos', () => {
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(65.25)).toBe('1:05.3')
    expect(formatTime(3725)).toBe('1:02:05.0')
  })
})
