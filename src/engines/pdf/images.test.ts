import { PDFDocument } from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import {
  exifSegment,
  makePng,
  TINY_JPEG,
  withSegments,
} from '../../lib/images.testing'
import { PdfError } from './errors'
import { imagesToPdf, layout, orient, type Placing } from './images'

const corner = ([a, b, c, d, e, f]: Placing, u: number, v: number) => [
  a * u + b * v + c,
  d * u + e * v + f,
]

const buffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer

describe('orient', () => {
  // Where the stored picture's top-left and top-right corners must end up,
  // from where EXIF says its first row and first column go.
  const EXIF: Record<number, [topLeft: number[], topRight: number[]]> = {
    1: [
      [0, 1],
      [1, 1],
    ], // row at the top, column at the left
    2: [
      [1, 1],
      [0, 1],
    ], // top, right
    3: [
      [1, 0],
      [0, 0],
    ], // bottom, right
    4: [
      [0, 0],
      [1, 0],
    ], // bottom, left
    5: [
      [0, 1],
      [0, 0],
    ], // left, top
    6: [
      [1, 1],
      [1, 0],
    ], // right, top
    7: [
      [1, 0],
      [1, 1],
    ], // right, bottom
    8: [
      [0, 0],
      [0, 1],
    ], // left, bottom
  }

  it('shows every EXIF orientation upright', () => {
    for (const [orientation, [topLeft, topRight]] of Object.entries(EXIF)) {
      const { placing, swaps } = orient(Number(orientation), 0)
      expect(corner(placing, 0, 1), `orientation ${orientation}`).toEqual(
        topLeft,
      )
      expect(corner(placing, 1, 1), `orientation ${orientation}`).toEqual(
        topRight,
      )
      expect(swaps).toBe(Number(orientation) >= 5)
    }
  })

  it('adds the turns chosen in Tuls', () => {
    expect(orient(1, 90)).toEqual(orient(6, 0))
    expect(orient(1, 180)).toEqual(orient(3, 0))
    expect(orient(6, 270)).toEqual(orient(1, 0))
    expect(orient(2, 180)).toEqual(orient(4, 0))
  })

  it('treats an unknown orientation as upright', () => {
    expect(orient(0, 0)).toEqual(orient(1, 0))
  })
})

describe('layout', () => {
  it('makes the page the picture’s size on screen', () => {
    expect(layout(800, 600, 'fit')).toEqual({
      page: [600, 450],
      box: { x: 0, y: 0, width: 600, height: 450 },
    })
  })

  it('turns paper to suit the picture, and fits it inside the margins', () => {
    const tall = layout(3000, 4000, 'a4')
    expect(tall.page).toEqual([595.28, 841.89])
    expect(tall.box.width).toBeCloseTo(595.28 - 48)
    const wide = layout(4000, 3000, 'letter')
    expect(wide.page).toEqual([792, 612])
    expect(wide.box.width).toBeCloseTo(792 - 48)
    expect(wide.box.x).toBeCloseTo((792 - wide.box.width) / 2)
  })

  it('never makes a small picture bigger than its size on screen', () => {
    const { box } = layout(100, 200, 'a4')
    expect(box).toEqual({
      width: 75,
      height: 150,
      x: (595.28 - 75) / 2,
      y: (841.89 - 150) / 2,
    })
  })
})

describe('imagesToPdf', () => {
  it('makes a page per image, turned upright and as chosen', async () => {
    const photo = withSegments(TINY_JPEG, [exifSegment({ orientation: 6 })])
    const png = await makePng(6, 3)
    const doc = await PDFDocument.load(
      await imagesToPdf(
        [
          { data: buffer(photo), format: 'jpeg', turn: 0 },
          { data: buffer(png), format: 'png', turn: 90 },
          { data: buffer(png), format: 'png', turn: 0 },
        ],
        'fit',
      ),
    )
    // The 8 × 4 photo stands on its side (EXIF 6); the 6 × 3 PNG is turned.
    expect(doc.getPages().map((page) => Object.values(page.getSize()))).toEqual(
      [
        [3, 6],
        [2.25, 4.5],
        [4.5, 2.25],
      ],
    )
  })

  it('leaves out the images’ personal details', async () => {
    const photo = withSegments(TINY_JPEG, [
      exifSegment({ orientation: 1, note: 'GPS 6.5244N 3.3792E' }),
    ])
    const png = await makePng(4, 4, { note: 'Taken at home' })
    const bytes = await imagesToPdf(
      [
        { data: buffer(photo), format: 'jpeg', turn: 0 },
        { data: buffer(png), format: 'png', turn: 0 },
      ],
      'a4',
    )
    const text = Buffer.from(bytes).toString('latin1')
    for (const detail of ['GPS', 'Exif', 'Taken at home']) {
      expect(text).not.toContain(detail)
    }
    // The photo itself is still there, unchanged.
    expect(text).toContain('ICC_PROFILE')
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    expect(doc.getProducer()).toBe('Tuls')
  })

  it('makes a PDF that opens, with see-through PNGs too', async () => {
    const png = await makePng(5, 5, { alpha: true })
    const bytes = await imagesToPdf(
      [
        { data: buffer(TINY_JPEG), format: 'jpeg', turn: 0 },
        { data: buffer(png), format: 'png', turn: 0 },
      ],
      'letter',
    )
    const doc = await getDocument({ data: bytes, verbosity: 0 }).promise
    expect(doc.numPages).toBe(2)
    await doc.loadingTask.destroy()
  })

  it('says when an image is damaged, and won’t make an empty PDF', async () => {
    const junk = buffer(new TextEncoder().encode('not a jpeg'))
    const damaged = await imagesToPdf(
      [{ data: junk, format: 'jpeg', turn: 0 }],
      'a4',
    ).catch((e) => e)
    expect(damaged).toBeInstanceOf(PdfError)
    expect(damaged.kind).toBe('unreadable')
    expect(await imagesToPdf([], 'a4').catch((e) => e)).toBeInstanceOf(PdfError)
  })
})
