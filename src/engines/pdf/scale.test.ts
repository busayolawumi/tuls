import { describe, expect, it } from 'vitest'
import { imageScale, MAX_PIXELS } from './scale'

const A4 = [595.28, 841.89] as const

describe('imageScale', () => {
  it('draws at the dots per inch asked for', () => {
    expect(imageScale(...A4, 150)).toBeCloseTo(150 / 72)
    expect(imageScale(...A4, 300)).toBeCloseTo(300 / 72)
    // A4 at 300 dpi is the familiar 2480 × 3508 pixels.
    expect(Math.round(A4[0] * imageScale(...A4, 300))).toBe(2480)
  })

  it('keeps big pages under what an iPhone can draw', () => {
    const A0 = [2383.94, 3370.39] as const
    const scale = imageScale(...A0, 300)
    expect(scale).toBeLessThan(300 / 72)
    expect(A0[0] * scale * A0[1] * scale).toBeCloseTo(MAX_PIXELS)
  })
})
