import { describe, expect, it } from 'vitest'
import { appleTrouble, isShort, isTooLong, listed } from './password'

describe('appleTrouble', () => {
  // The cases tested against Apple's PDFKit (CLAUDE.md, "Protect PDF and
  // Unlock PDF: findings").
  it('passes what iPhones and Macs open', () => {
    for (const password of [
      'Tr0ub4dor & 3! #$%',
      'café ñandú über ça',
      'Ọlá Àdé ṣé',
      'ɗ ƙ ƴ',
      'Tiếng Việt',
      'Ελληνικά',
      'Привет',
      'مرحبا',
      'שלום',
      '密码安全',
      'がぎぐ パスワード',
      '비밀번호',
      '€£¥ — “quotes”',
      'Ångström naïve Straße İstanbul',
    ]) {
      expect(appleTrouble(password), password).toEqual([])
    }
  })

  it('names what they don’t', () => {
    expect(appleTrouble('Ẹ̀kọ́ ọ̀rọ̀')).toEqual(['Ẹ̀', 'ọ́', 'ọ̀'])
    expect(appleTrouble('ị ụ ṅ Ọ̀')).toEqual(['Ọ̀'])
    expect(appleTrouble('pass🙂word')).toEqual(['🙂'])
    expect(appleTrouble('Ｐａｓｓ')).toEqual(['Ｐ', 'ａ', 'ｓ'])
    expect(appleTrouble('ﬁne')).toEqual(['ﬁ'])
    expect(appleTrouble('wait… Brand™ ½ x²')).toEqual(['…', '™', '½', '²'])
    expect(appleTrouble('ｱｲｳ')).toEqual(['ｱ', 'ｲ', 'ｳ'])
    expect(appleTrouble('नमस्ते').length).toBeGreaterThan(0)
    expect(appleTrouble('สวัสดี').length).toBeGreaterThan(0)
  })

  it('reads letters typed broken up as composed', () => {
    expect(appleTrouble('Àdé'.normalize('NFD'))).toEqual([])
  })
})

describe('isTooLong', () => {
  it('counts bytes, composed and broken up', () => {
    expect(isTooLong('a'.repeat(127))).toBe(false)
    expect(isTooLong('a'.repeat(128))).toBe(true)
    // 3 bytes each.
    expect(isTooLong('密'.repeat(42))).toBe(false)
    expect(isTooLong('密'.repeat(43))).toBe(true)
    // é is 2 bytes composed, 3 broken up.
    expect(isTooLong('é'.repeat(50))).toBe(true)
  })
})

describe('isShort', () => {
  it('hints below 8 characters, but not when empty', () => {
    expect(isShort('')).toBe(false)
    expect(isShort('1234567')).toBe(true)
    expect(isShort('12345678')).toBe(false)
    expect(isShort('🙂'.repeat(8))).toBe(false)
  })
})

describe('listed', () => {
  it('joins with commas and “and”', () => {
    expect(listed(['a'])).toBe('a')
    expect(listed(['a', 'b'])).toBe('a and b')
    expect(listed(['a', 'b', 'c'])).toBe('a, b and c')
  })
})
