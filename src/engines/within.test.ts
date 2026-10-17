import { describe, expect, it, vi } from 'vitest'
import { within } from './within'

describe('time limits', () => {
  it('passes on what finishes in time, and fails what doesn’t', async () => {
    vi.useFakeTimers()
    try {
      await expect(
        within(Promise.resolve(4), 1000, () => 'late'),
      ).resolves.toBe(4)
      const never = within(new Promise(() => {}), 1000, () => new Error('late'))
      vi.advanceTimersByTime(1000)
      await expect(never).rejects.toThrow('late')
    } finally {
      vi.useRealTimers()
    }
  })
})
