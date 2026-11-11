import { describe, expect, it } from 'vitest'
import {
  allText,
  confidentText,
  enlargement,
  isReliable,
  letterCount,
  sureScore,
  textFileName,
  tidyText,
  wordsLabel,
} from './text'

describe('tidyText', () => {
  it('drops spaces at line ends and runs of blank lines', () => {
    expect(tidyText('  Hello  \r\n\r\n\n\nworld\t\n\n')).toBe('Hello\n\nworld')
  })
})

describe('allText', () => {
  it('is just the text for one image', () => {
    expect(allText([{ name: 'a.png', text: 'Hi' }])).toBe('Hi')
  })

  it('puts each image’s text under its name, in order', () => {
    expect(
      allText([
        { name: 'a.png', text: 'One' },
        { name: 'b.jpg', text: '' },
        { name: 'c.heic', text: 'Three' },
      ]),
    ).toBe(
      'a.png\n\nOne\n\n\nb.jpg\n\nNo text found in it.\n\n\nc.heic\n\nThree',
    )
  })
})

describe('textFileName', () => {
  it('is named after one image, or general for several', () => {
    expect(textFileName(['IMG_1234.HEIC'])).toBe('IMG_1234.txt')
    expect(textFileName(['a.png', 'b.png'])).toBe('Text from images.txt')
  })
})

describe('wordsLabel', () => {
  it('counts words in any language', () => {
    expect(wordsLabel('Ọlá ń bọ̀, 2,450.00')).toBe('4 words')
    expect(wordsLabel('one')).toBe('1 word')
  })
})

describe('confidentText', () => {
  const word = (text: string, confidence: number) => ({ text, confidence })

  it('keeps sure words, with their lines and paragraphs', () => {
    expect(
      confidentText([
        [
          [word('Hello', 96), word('Sn', 20), word('there', 90)],
          [word('3', 31)],
        ],
        [[word('®', 67), word('BUSAYO', 56)], [word('CODES', 95)]],
      ]),
    ).toBe('Hello there\n\nBUSAYO\nCODES')
  })

  it('is empty when nothing is sure', () => {
    expect(confidentText([[[word('Sn', 12)]]])).toBe('')
  })
})

describe('letterCount', () => {
  it('counts letters and digits only', () => {
    expect(letterCount('Ọlá — 2,450!')).toBe(7)
  })
})

describe('sureScore', () => {
  it('prefers the read with more sure letters', () => {
    const word = (text: string, confidence: number) => ({ text, confidence })
    const plain = sureScore([[[word('BUSAYOD', 56), word('ODES', 95)]]])
    const clear = sureScore([
      [[word('—', 46), word('BUSAYO', 75), word('CODES', 95)]],
    ])
    expect(clear).toBeGreaterThan(plain)
  })
})

describe('enlargement', () => {
  it('enlarges small images, up to 4 times', () => {
    expect(enlargement(200, 200)).toBe(4)
    expect(enlargement(400, 300)).toBe(3)
    expect(enlargement(1179, 2556)).toBe(1)
  })
})

describe('isReliable', () => {
  const word = (text: string, confidence: number) => ({ text, confidence })

  it('turns down fragments of a picture', () => {
    const photo = ['i', 'E', 'I', '»', '|', 'v', 'y', 'J', '4', 'a']
    expect(isReliable([[photo.map((text) => word(text, 75))]])).toBe(false)
    expect(isReliable([[[word('if', 50)]]])).toBe(false)
    expect(isReliable([])).toBe(false)
  })

  it('accepts real words, even from a hard logo', () => {
    expect(isReliable([[[word('BUSAYO', 73), word('CODES', 95)]]])).toBe(true)
    expect(
      isReliable([[[word('Your', 96), word('transfer', 95), word('of', 93)]]]),
    ).toBe(true)
  })

  it('turns down one lucky word among many fragments', () => {
    const noise = 'abcdefghij'.split('').map((text) => word(text, 80))
    expect(isReliable([[[word('the', 80), ...noise]]])).toBe(false)
  })
})
