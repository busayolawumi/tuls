import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_SIZE,
  acceptOf,
  checkDocument,
  contentProblem,
  documentBase,
  languageTag,
  pdfNames,
} from './files'

const WORD = ['docx', 'doc', 'odt', 'rtf']
const file = (name: string, size: number) => ({ name, size, type: '' }) as File

describe('checking documents', () => {
  it('takes the kinds of file the tool converts, by extension', () => {
    expect(checkDocument(file('a.docx', 10), WORD, 'a Word document')).toBe(
      undefined,
    )
    expect(checkDocument(file('B.RTF', 10), WORD, 'a Word document')).toBe(
      undefined,
    )
    expect(checkDocument(file('a.pdf', 10), WORD, 'a Word document')).toBe(
      'That isn’t a Word document.',
    )
    expect(checkDocument(file('notes', 10), WORD, 'a Word document')).toBe(
      'That isn’t a Word document.',
    )
  })

  it('turns down empty and very big files', () => {
    expect(checkDocument(file('a.docx', 0), WORD, 'x')).toBe(
      'That file is empty.',
    )
    expect(checkDocument(file('a.docx', MAX_FILE_SIZE + 1), WORD, 'x')).toMatch(
      /^That file is .* Each can be up to 100 MB\.$/,
    )
  })

  it('lists extensions for the file picker', () => {
    expect(acceptOf(WORD)).toBe('.docx,.doc,.odt,.rtf')
  })
})

describe('naming the PDFs', () => {
  it('names each after its document', () => {
    expect(documentBase('Report final.docx')).toBe('Report final')
    expect(documentBase('.docx')).toBe('document')
    expect(pdfNames(['a.docx', 'b.odt'])).toEqual(['a.pdf', 'b.pdf'])
  })

  it('numbers documents with the same name', () => {
    expect(pdfNames(['CV.docx', 'cv.doc', 'CV.odt', 'other.rtf'])).toEqual([
      'CV.pdf',
      'cv (2).pdf',
      'CV (3).pdf',
      'other.pdf',
    ])
  })
})

describe('looking inside documents', () => {
  const bytes = (...values: number[]) => new Uint8Array(values)
  const text = (value: string) => new TextEncoder().encode(value)
  const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0)
  const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)

  it('accepts files that start the way their kind does', () => {
    expect(contentProblem('docx', ZIP)).toBeUndefined()
    for (const extension of ['xlsx', 'xlsm', 'pptx', 'ppsx', 'ods', 'odp']) {
      expect(contentProblem(extension, ZIP)).toBeUndefined()
      expect(contentProblem(extension, text('not a zip'))).toBe('unreadable')
    }
    expect(contentProblem('xlsx', OLE)).toBe('password')
    expect(contentProblem('odt', ZIP)).toBeUndefined()
    expect(contentProblem('rtf', text('{\\rtf1\\ansi'))).toBeUndefined()
  })

  it('spots a locked Word file', () => {
    expect(contentProblem('docx', OLE)).toBe('password')
  })

  it('spots a file that isn’t what its name says', () => {
    expect(contentProblem('docx', text('hello there'))).toBe('unreadable')
    expect(contentProblem('rtf', ZIP)).toBe('unreadable')
  })

  it('leaves alone kinds that come in many forms', () => {
    expect(contentProblem('doc', OLE)).toBeUndefined()
    expect(contentProblem('doc', text('{\\rtf1'))).toBeUndefined()
    expect(contentProblem('doc', text('<html>'))).toBeUndefined()
  })
})

describe('the language for LibreOffice', () => {
  it('passes plain language tags on, tidied', () => {
    expect(languageTag('en-NG')).toBe('en-NG')
    expect(languageTag('en-gb')).toBe('en-GB')
    expect(languageTag('fr')).toBe('fr')
    expect(languageTag('zh-Hant-TW')).toBe('zh-Hant-TW')
    expect(languageTag('es-419')).toBe('es-419')
  })

  it('leaves out anything else', () => {
    expect(languageTag(undefined)).toBeUndefined()
    expect(languageTag('')).toBeUndefined()
    expect(languageTag('en-US-x-private')).toBeUndefined()
    expect(languageTag('en,Language=xx')).toBeUndefined()
  })
})
