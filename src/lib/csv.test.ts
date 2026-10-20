import { describe, expect, it } from 'vitest'
import { decodeText, parseRows, readCsv, sniffSeparator } from './csv'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('decoding', () => {
  it('reads UTF-8, with or without its mark', () => {
    const text = 'Città,€5'
    const utf8 = new TextEncoder().encode(text)
    expect(decodeText(utf8)).toBe(text)
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe(text)
  })

  it('reads UTF-16, as Excel’s “Unicode text” saves it', () => {
    expect(decodeText(bytes(0xff, 0xfe, 0x41, 0, 0x2c, 0, 0xe9, 0))).toBe('A,é')
    expect(decodeText(bytes(0xfe, 0xff, 0, 0x41, 0, 0x2c, 0, 0xe9))).toBe('A,é')
  })

  it('falls back to Windows-1252, as older Excel saved CSVs', () => {
    // "Café,€5" in Windows-1252: é is 0xE9, € is 0x80.
    expect(decodeText(bytes(0x43, 0x61, 0x66, 0xe9, 0x2c, 0x80, 0x35))).toBe(
      'Café,€5',
    )
  })
})

describe('parsing', () => {
  it('handles quotes, doubled quotes and line breaks inside quotes', () => {
    expect(
      parseRows('a,"b, c","say ""hi""","two\nlines"\r\nd,e,f,g\n', ','),
    ).toEqual([
      ['a', 'b, c', 'say "hi"', 'two\nlines'],
      ['d', 'e', 'f', 'g'],
    ])
  })

  it('takes CR, LF and CRLF line ends, and keeps empty fields', () => {
    expect(parseRows('a,,c\rd,e,\n,,', ',')).toEqual([
      ['a', '', 'c'],
      ['d', 'e', ''],
      ['', '', ''],
    ])
  })
})

describe('finding the separator', () => {
  it('picks the one that splits lines evenly', () => {
    expect(sniffSeparator('Name;Amount\nAda;1,50\nBo;2,75')).toBe(';')
    expect(sniffSeparator('Name,Amount\nAda,1.50\nBo,2.75')).toBe(',')
    expect(sniffSeparator('Name\tNote\nAda\tHi, there\nBo\tOk')).toBe('\t')
    expect(sniffSeparator('a|b|c\n1|2|3')).toBe('|')
  })

  it('isn’t fooled by commas inside quotes', () => {
    expect(sniffSeparator('"Smith, Ada";12\n"Obi, Bo";7\n"Li, Chi";9')).toBe(
      ';',
    )
  })

  it('honours Excel’s sep= line, and pads ragged rows', () => {
    expect(readCsv('sep=;\nA;B,C\n1;2\n3')).toEqual({
      separator: ';',
      rows: [
        ['A', 'B,C'],
        ['1', '2'],
        ['3', ''],
      ],
    })
  })

  it('drops blank lines at the end', () => {
    expect(readCsv('a,b\n1,2\n\n,\n').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})
