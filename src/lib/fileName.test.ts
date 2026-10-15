import { describe, expect, it } from 'vitest'
import { fileName, splitName } from './fileName'

describe('splitName', () => {
  it('splits off the extension', () => {
    expect(splitName('report-merged.pdf')).toEqual(['report-merged', '.pdf'])
    expect(splitName('scan.final.pdf')).toEqual(['scan.final', '.pdf'])
    expect(splitName('README')).toEqual(['README', ''])
    expect(splitName('.pdf')).toEqual(['.pdf', ''])
  })
})

describe('fileName', () => {
  it('uses what was typed, with the extension', () => {
    expect(fileName('Bank statements Jan–Mar', 'report', '.pdf')).toBe(
      'Bank statements Jan–Mar.pdf',
    )
  })

  it('doesn’t double an extension that was typed too', () => {
    expect(fileName('Statement.pdf', 'report', '.pdf')).toBe('Statement.pdf')
    expect(fileName('Statement.PDF', 'report', '.pdf')).toBe('Statement.pdf')
    expect(fileName('Statement.gif', 'report', '.pdf')).toBe(
      'Statement.gif.pdf',
    )
  })

  it('removes what some systems don’t allow', () => {
    expect(fileName('a/b\\c:d*e?f"g<h>i|j', 'report', '.pdf')).toBe(
      'abcdefghij.pdf',
    )
    expect(fileName('  lots   of\tspace  ', 'report', '.pdf')).toBe(
      'lots of space.pdf',
    )
    expect(fileName('bell\u0007and\u007fdelete', 'report', '.pdf')).toBe(
      'bellanddelete.pdf',
    )
    expect(fileName('..hidden', 'report', '.pdf')).toBe('hidden.pdf')
    expect(fileName('trailing dots...', 'report', '.pdf')).toBe(
      'trailing dots.pdf',
    )
  })

  it('falls back when nothing usable is left', () => {
    expect(fileName('', 'report', '.pdf')).toBe('report.pdf')
    expect(fileName('  //  ', 'report', '.pdf')).toBe('report.pdf')
    expect(fileName('.pdf', 'report', '.pdf')).toBe('report.pdf')
    expect(fileName('CON', 'report', '.pdf')).toBe('report.pdf')
  })

  it('keeps names to a sensible length', () => {
    expect(fileName('a'.repeat(300), 'report', '.pdf')).toBe(
      `${'a'.repeat(150)}.pdf`,
    )
  })

  it('works without an extension', () => {
    expect(fileName('Statements', 'report')).toBe('Statements')
  })
})
