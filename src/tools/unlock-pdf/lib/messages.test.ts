import { describe, expect, it } from 'vitest'
import { wrongPassword } from './messages'

describe('wrongPassword', () => {
  it('says how many the password didn’t open', () => {
    expect(wrongPassword(1, 1)).toBe(
      'That password didn’t open it. Check it and try again.',
    )
    expect(wrongPassword(3, 3)).toBe(
      'That password didn’t open them. Check it and try again.',
    )
    expect(wrongPassword(1, 3)).toBe(
      'That password didn’t open 1 of the 3 PDFs. Type its password and try again.',
    )
    expect(wrongPassword(2, 3)).toBe(
      'That password didn’t open 2 of the 3 PDFs. Type theirs and try again.',
    )
  })
})
