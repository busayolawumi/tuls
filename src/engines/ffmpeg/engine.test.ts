import { describe, expect, it } from 'vitest'
import { errorKind } from './engine'

describe('errorKind', () => {
  it('spots running out of memory', () => {
    for (const message of [
      'RuntimeError: memory access out of bounds',
      'Aborted(OOM)',
      'Cannot enlarge memory arrays',
      'RangeError: Array buffer allocation failed',
    ]) {
      expect(errorKind(new Error(message), 'unknown')).toBe('memory')
    }
  })

  it('spots videos FFmpeg can’t read', () => {
    for (const message of [
      'ffmpeg exited with 1:\ninput: Invalid data found when processing input',
      'moov atom not found',
      'Stream specifier matches no streams',
    ]) {
      expect(errorKind(new Error(message), 'unknown')).toBe('unreadable')
    }
  })

  it('falls back to the kind it was given', () => {
    expect(errorKind(new Error('Failed to fetch'), 'network')).toBe('network')
    expect(errorKind('something odd', 'unknown')).toBe('unknown')
  })
})
