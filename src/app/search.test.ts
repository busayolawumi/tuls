import { describe, expect, it } from 'vitest'
import { tools } from '../tools/registry'
import { searchTools, words } from './search'

const names = (query: string) => searchTools(tools, query).map((t) => t.name)

describe('words', () => {
  it('lowercases, drops accents and splits on anything else', () => {
    expect(words('Café → PDFs, 2-up')).toEqual(['cafe', 'pdfs', '2', 'up'])
  })
})

describe('searchTools', () => {
  it('lists every tool for nothing, or only filler words', () => {
    expect(searchTools(tools, '')).toEqual(tools)
    expect(searchTools(tools, '  the file  ')).toEqual(tools)
  })

  it('finds tools by what people call the job', () => {
    expect(names('combine')).toEqual(['Merge PDFs'])
    expect(names('join')).toEqual(['Merge PDFs'])
    expect(names('password')).toEqual(['Protect PDF', 'Unlock PDF'])
    expect(names('rotate')).toEqual(['Organise PDF'])
    expect(names('organize')).toEqual(['Organise PDF'])
    expect(names('slides')).toEqual(['PowerPoint to PDF'])
  })

  it('finds tools by file type', () => {
    expect(names('heic')).toEqual([
      'Images to PDF',
      'Convert images',
      'Resize images',
      'Compress images',
    ])
    expect(names('mov')).toEqual(['Video to GIF'])
    expect(names('csv')).toEqual(['Excel to PDF'])
  })

  it('puts the tool named by a conversion first, whichever way round', () => {
    expect(names('pdf to word')[0]).toBe('PDF to Word')
    expect(names('word to pdf')[0]).toBe('Word to PDF')
    expect(names('pdf to w')[0]).toBe('PDF to Word')
    expect(names('jpg to pdf')[0]).toBe('Images to PDF')
    expect(names('heic to jpg')[0]).toBe('Convert images')
  })

  it('puts tools named by the word before ones that only mention it', () => {
    const found = names('compress')
    expect(found.slice(0, 2)).toEqual(['Compress PDF', 'Compress images'])
  })

  it('matches the start of a word, plurals and capitals', () => {
    expect(names('comp')).toContain('Compress PDF')
    expect(names('PDFS')).toContain('Merge PDFs')
    expect(names('image')).toContain('Resize images')
    expect(names('Ünlock')).toEqual(['Unlock PDF'])
  })

  it('needs every word to match', () => {
    expect(names('merge video')).toEqual([])
    expect(names('xyzzy')).toEqual([])
  })
})
