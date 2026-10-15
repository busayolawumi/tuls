import { describe, expect, it } from 'vitest'
import {
  aspectOf,
  initialCrop,
  moveCrop,
  resizeCrop,
  snap,
  type Corner,
  type Crop,
} from './crop'

const landscape = { width: 1920, height: 1080 }
const portrait = { width: 1080, height: 1920 }

/** Even-sized and inside the video, which FFmpeg's crop filter needs. */
function expectValid(crop: Crop, video: { width: number; height: number }) {
  for (const n of [crop.x, crop.y, crop.width, crop.height]) {
    expect(n % 2).toBe(0)
  }
  expect(crop.x).toBeGreaterThanOrEqual(0)
  expect(crop.y).toBeGreaterThanOrEqual(0)
  expect(crop.x + crop.width).toBeLessThanOrEqual(video.width)
  expect(crop.y + crop.height).toBeLessThanOrEqual(video.height)
}

describe('aspectOf', () => {
  it('gives width ÷ height for the fixed shapes only', () => {
    expect(aspectOf('Square')).toBe(1)
    expect(aspectOf('4:5')).toBe(0.8)
    expect(aspectOf('16:9')).toBeCloseTo(16 / 9)
    expect(aspectOf('9:16')).toBeCloseTo(9 / 16)
    expect(aspectOf('Original')).toBeUndefined()
    expect(aspectOf('Free')).toBeUndefined()
  })
})

describe('snap', () => {
  it('rounds to even pixels and keeps the crop inside the video', () => {
    const crop = snap({ x: 1901, y: -5, width: 101, height: 77 }, landscape)
    expect(crop).toEqual({ x: 1820, y: 0, width: 100, height: 76 })
  })

  it('never makes a crop bigger than the video', () => {
    const crop = snap({ x: 0, y: 0, width: 5000, height: 5000 }, landscape)
    expect(crop).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })
})

describe('initialCrop', () => {
  it('means no crop for Original', () => {
    expect(initialCrop('Original', landscape)).toBeUndefined()
  })

  it('gives the biggest square, centred', () => {
    expect(initialCrop('Square', landscape)).toEqual({
      x: 420,
      y: 0,
      width: 1080,
      height: 1080,
    })
  })

  it('fits a portrait shape inside a landscape video', () => {
    const crop = initialCrop('9:16', landscape)!
    expect(crop.height).toBe(1080)
    expect(crop.width / crop.height).toBeCloseTo(9 / 16, 2)
    expectValid(crop, landscape)
  })

  it('starts Free at 80% of the picture', () => {
    expect(initialCrop('Free', portrait)).toEqual({
      x: 108,
      y: 192,
      width: 864,
      height: 1536,
    })
  })

  it('centres a new shape on the previous crop', () => {
    const previous = { x: 0, y: 0, width: 400, height: 400 }
    const crop = initialCrop('Square', landscape, previous)!
    // As close to the old centre (200, 200) as the edges allow.
    expect(crop).toEqual({ x: 0, y: 0, width: 1080, height: 1080 })
  })
})

describe('moveCrop', () => {
  it('stops at the edges', () => {
    const start = { x: 100, y: 100, width: 400, height: 300 }
    expect(moveCrop(start, 99999, 99999, landscape)).toEqual({
      x: 1520,
      y: 780,
      width: 400,
      height: 300,
    })
    expect(moveCrop(start, -99999, -99999, landscape)).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
  })
})

describe('resizeCrop', () => {
  const start = { x: 400, y: 200, width: 600, height: 400 }

  it('moves the dragged corner and keeps the opposite one', () => {
    expect(resizeCrop(start, 'se', 100, 50, landscape)).toEqual({
      x: 400,
      y: 200,
      width: 700,
      height: 450,
    })
  })

  it('keeps a fixed shape while resizing', () => {
    const crop = resizeCrop(start, 'se', 300, 10, landscape, 1)
    expect(crop.width).toBe(crop.height)
    expect(crop.x).toBe(400)
    expect(crop.y).toBe(200)
  })

  it('flips over when dragged past the opposite corner', () => {
    const crop = resizeCrop(start, 'se', -800, 0, landscape)
    expect(crop.x + crop.width).toBe(400)
  })

  it('never goes below a tenth of the shorter side', () => {
    const crop = resizeCrop(start, 'se', -598, -398, landscape)
    expect(crop.width).toBeGreaterThanOrEqual(108)
    expect(crop.height).toBeGreaterThanOrEqual(108)
  })

  it('always stays valid, whatever the drag', () => {
    // A fixed pseudo-random sequence, so failures can be reproduced.
    let seed = 42
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const corners: Corner[] = ['nw', 'ne', 'sw', 'se']
    for (let i = 0; i < 500; i++) {
      const corner = corners[Math.floor(random() * 4)]
      const dx = (random() - 0.5) * 4000
      const dy = (random() - 0.5) * 4000
      const aspect = [undefined, 1, 0.8, 16 / 9, 9 / 16][
        Math.floor(random() * 5)
      ]
      expectValid(
        resizeCrop(start, corner, dx, dy, landscape, aspect),
        landscape,
      )
    }
  })
})
