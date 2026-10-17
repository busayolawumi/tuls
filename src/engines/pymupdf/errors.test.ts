import { describe, expect, it } from 'vitest'
import { WordError, wordErrorKind } from './errors'

describe('PDF to Word errors', () => {
  it('works out what went wrong from the message', () => {
    expect(
      wordErrorKind(new Error('PythonError: document closed or encrypted')),
    ).toBe('password')
    expect(wordErrorKind(new TypeError('Failed to fetch'))).toBe('network')
    expect(wordErrorKind('MemoryError: ')).toBe('memory')
    expect(wordErrorKind('RuntimeError: Cannot enlarge memory arrays')).toBe(
      'memory',
    )
    expect(wordErrorKind('FileDataError: Failed to open stream')).toBe(
      'unreadable',
    )
    expect(wordErrorKind(new Error('something else'))).toBe('unknown')
    expect(wordErrorKind(new WordError('stuck'))).toBe('stuck')
  })
})
