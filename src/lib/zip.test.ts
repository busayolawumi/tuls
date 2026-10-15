import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { zipFiles } from './zip'

describe('zipFiles', () => {
  it('puts every file in, by name, unchanged', () => {
    const a = new Uint8Array([1, 2, 3])
    const b = new TextEncoder().encode('%PDF-1.7 and so on')
    const files = unzipSync(
      zipFiles([
        { name: 'report-pages-1-2.pdf', data: a },
        { name: 'report-page-3.pdf', data: b },
      ]),
    )
    expect(Object.keys(files)).toEqual([
      'report-pages-1-2.pdf',
      'report-page-3.pdf',
    ])
    expect(files['report-pages-1-2.pdf']).toEqual(a)
    expect(files['report-page-3.pdf']).toEqual(b)
  })

  it('stores files rather than compressing them', () => {
    const data = new Uint8Array(10_000) // all zeros: would shrink a lot
    expect(zipFiles([{ name: 'a.pdf', data }]).length).toBeGreaterThan(10_000)
  })
})
