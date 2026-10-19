import { describe, expect, it } from 'vitest'
import { passwordHints, passwordProblem, TOO_LONG } from './newPassword'

describe('passwordHints', () => {
  it('says nothing about a good password', () => {
    expect(passwordHints('')).toEqual([])
    expect(passwordHints('correct horse 42')).toEqual([])
  })

  it('hints at short passwords', () => {
    expect(passwordHints('1234')).toEqual([
      {
        text: 'Short passwords are easy to guess. 8 characters or more is safer.',
        warning: false,
      },
    ])
  })

  it('warns about what iPhones and Macs can’t open', () => {
    const [hint] = passwordHints('Ẹ̀kọ́ ọ̀rọ̀ 2026')
    expect(hint.warning).toBe(true)
    expect(hint.text).toContain('because of Ẹ̀, ọ́ and ọ̀.')
  })

  it('warns about a password too long', () => {
    expect(passwordHints('a'.repeat(128))[0].text).toBe(TOO_LONG)
  })
})

describe('passwordProblem', () => {
  it('needs a password, typed twice the same', () => {
    expect(passwordProblem('', '')).toEqual({
      message: 'Type a password.',
      box: 'password',
    })
    expect(passwordProblem('secret', '')?.box).toBe('again')
    expect(passwordProblem('secret', 'secrte')).toEqual({
      message: 'The two passwords don’t match.',
      box: 'again',
    })
    expect(passwordProblem('a'.repeat(128), 'a'.repeat(128))?.message).toBe(
      TOO_LONG,
    )
    expect(passwordProblem('secret', 'secret')).toBeUndefined()
  })

  it('takes letters typed composed or broken up as the same', () => {
    expect(
      passwordProblem('Àdé'.normalize('NFC'), 'Àdé'.normalize('NFD')),
    ).toBeUndefined()
  })

  it('lets short and Apple-unfriendly passwords through', () => {
    expect(passwordProblem('1🙂', '1🙂')).toBeUndefined()
  })
})
