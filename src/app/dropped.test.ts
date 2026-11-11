import { describe, expect, it } from 'vitest'
import { tools } from '../tools/registry'
import {
  acceptAll,
  fileNames,
  filesTitle,
  kindOf,
  toolsFor,
  unknownMessage,
} from './dropped'

const file = (name: string, type = '') => ({ name, type })
const namesFor = (...files: { name: string; type: string }[]) => {
  const fit = toolsFor(tools, files)
  return 'tools' in fit ? fit.tools.map((tool) => tool.name) : fit
}

describe('kindOf', () => {
  it('reads the extension, lowercase, or the type without one', () => {
    expect(kindOf(file('IMG_0001.HEIC'))).toBe('heic')
    expect(kindOf(file('report.final.pdf'))).toBe('pdf')
    expect(kindOf(file('photo.jfif'))).toBe('jpg')
    expect(kindOf(file('shared', 'application/pdf'))).toBe('pdf')
    expect(kindOf(file('shared'))).toBeUndefined()
  })
})

describe('toolsFor', () => {
  it('offers every tool that opens one PDF, single-file ones too', () => {
    expect(namesFor(file('a.pdf'))).toEqual([
      'Merge PDFs',
      'Organise PDF',
      'Split PDF',
      'PDF to images',
      'Protect PDF',
      'Unlock PDF',
      'Compress PDF',
      'OCR PDF',
      'PDF to Word',
      'PDF to Excel',
    ])
  })

  it('leaves out tools that take one file when there are several', () => {
    const found = namesFor(file('a.pdf'), file('b.PDF'))
    expect(found).toContain('Merge PDFs')
    expect(found).not.toContain('Split PDF')
  })

  it('offers only tools that open every file', () => {
    expect(namesFor(file('a.jpg'), file('b.heic'), file('c.png'))).toEqual([
      'Images to PDF',
      'Convert images',
      'Resize images',
      'Compress images',
      'Image to text',
    ])
    expect(namesFor(file('a.docx'), file('b.doc'))).toEqual(['Word to PDF'])
    expect(namesFor(file('clip.mov'))).toEqual(['Video to GIF'])
  })

  it('says which kinds nothing opens', () => {
    expect(namesFor(file('a.zip'), file('b.pdf'), file('c.ZIP'))).toEqual({
      problem: 'unknown',
      kinds: ['zip'],
    })
    expect(namesFor(file('notes'))).toEqual({ problem: 'unknown', kinds: [''] })
  })

  it('says when no one tool opens them all together', () => {
    expect(namesFor(file('a.pdf'), file('b.docx'))).toEqual({
      problem: 'mixed',
    })
    expect(namesFor(file('a.mov'), file('b.mp4'))).toEqual({
      problem: 'one at a time',
    })
  })
})

describe('the words', () => {
  it('names what can’t be opened', () => {
    expect(unknownMessage(['zip'])).toBe('Tuls can’t open ZIP files yet.')
    expect(unknownMessage(['zip', 'rar', 'txt'])).toBe(
      'Tuls can’t open ZIP, RAR or TXT files yet.',
    )
    expect(unknownMessage([''])).toBe('Tuls can’t open this kind of file yet.')
  })

  it('names the files', () => {
    const files = ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'].map((n) =>
      file(n),
    )
    expect(filesTitle(files.slice(0, 1))).toBe('a.pdf')
    expect(filesTitle(files)).toBe('these 5 files')
    expect(fileNames(files.slice(0, 2))).toBe('a.pdf and b.pdf')
    expect(fileNames(files.slice(0, 4))).toBe('a.pdf, b.pdf, c.pdf and d.pdf')
    expect(fileNames(files)).toBe('a.pdf, b.pdf, c.pdf and 2 more')
  })

  it('lets the picker choose anything some tool opens', () => {
    const accept = acceptAll(tools).split(',')
    for (const kind of ['.pdf', '.heic', '.docx', '.csv', '.mov', 'image/heic'])
      expect(accept).toContain(kind)
    expect(new Set(accept).size).toBe(accept.length)
  })
})
