import { describe, expect, it } from 'vitest'
import {
  compressPixels,
  FLOOR,
  QUALITY,
  SMALLEST_SIDE,
  TOP,
  withinSide,
  type Encoders,
  type Pixels,
} from './fit'

const picture = (width: number, height: number): Pixels => ({
  data: new Uint8ClampedArray(width * height * 4),
  width,
  height,
})

/** Fake encoders: a file's size grows with its pixels and quality. */
function fake(colours: 'work' | 'fail' = 'work') {
  const calls: string[] = []
  const bytes = (n: number) => new Uint8Array(Math.max(1, Math.round(n)))
  const encoders: Encoders = {
    lossy: async (p, quality) => {
      calls.push(`lossy ${p.width} q${quality}`)
      return bytes(p.width * p.height * (quality / 100))
    },
    exact: async (p) => {
      calls.push(`exact ${p.width}`)
      return bytes(p.width * p.height * 2)
    },
    colours: async (p, min, target) => {
      calls.push(`colours ${p.width} ${min}-${target}`)
      return colours === 'work' ? bytes(p.width * p.height * 0.5) : undefined
    },
    resize: async (_, width, height) => {
      calls.push(`resize ${width}x${height}`)
      return picture(width, height)
    },
  }
  return { encoders, calls }
}

describe('withinSide', () => {
  it('fits the longer side, keeping proportions', () => {
    expect(withinSide(5120, 2880, 2560)).toEqual({ width: 2560, height: 1440 })
    expect(withinSide(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 })
    expect(withinSide(800, 600, 2560)).toEqual({ width: 800, height: 600 })
  })
})

describe('compressPixels at a level', () => {
  it('saves photos at the level’s quality, at full size', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(4000, 3000),
      'jpeg',
      { level: 'recommended' },
      encoders,
    )
    expect(calls).toEqual([`lossy 4000 q${QUALITY.recommended}`])
    expect(made).toMatchObject({ width: 4000, height: 3000 })
  })

  it('makes very big pictures smaller at Smallest', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(4000, 3000),
      'webp',
      { level: 'smallest' },
      encoders,
    )
    expect(calls).toEqual([
      `resize ${SMALLEST_SIDE}x1920`,
      `lossy ${SMALLEST_SIDE} q${QUALITY.smallest}`,
    ])
    expect(made).toMatchObject({ width: SMALLEST_SIDE, height: 1920 })
  })

  it('reduces a PNG’s colours, or keeps it exact when that would show', async () => {
    const reduced = fake()
    await compressPixels(
      picture(100, 80),
      'png',
      { level: 'recommended' },
      reduced.encoders,
    )
    expect(reduced.calls).toEqual(['colours 100 65-90'])

    const exact = fake('fail')
    await compressPixels(
      picture(100, 80),
      'png',
      { level: 'recommended' },
      exact.encoders,
    )
    expect(exact.calls).toEqual(['colours 100 65-90', 'exact 100'])
  })

  it('keeps PNGs too big for colour reduction exact', async () => {
    const { encoders, calls } = fake()
    await compressPixels(
      picture(5000, 4000),
      'png',
      { level: 'recommended' },
      encoders,
    )
    expect(calls).toEqual(['exact 5000'])
  })
})

describe('compressPixels under a size', () => {
  it('stops at the top quality when it already fits', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(100, 100),
      'jpeg',
      { under: 100_000 },
      encoders,
    )
    expect(calls).toEqual([`lossy 100 q${TOP}`])
    expect(made?.bytes.length).toBe(8500)
  })

  it('finds the best quality that fits', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(100, 100),
      'jpeg',
      { under: 6000 },
      encoders,
    )
    expect(made!.bytes.length).toBeLessThanOrEqual(6000)
    expect(made!.bytes.length).toBeGreaterThan(5400)
    expect(made).toMatchObject({ width: 100, height: 100 })
    expect(calls.length).toBeLessThanOrEqual(6)
  })

  it('makes the picture smaller, from the original, when the floor is too big', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(1000, 500),
      'jpeg',
      { under: 50_000 },
      encoders,
    )
    expect(calls).toContain(`lossy 1000 q${FLOOR}`)
    expect(calls.some((call) => call.startsWith('resize'))).toBe(true)
    expect(made!.bytes.length).toBeLessThanOrEqual(50_000)
    expect(made!.width).toBeLessThan(1000)
    expect(made!.width / made!.height).toBeCloseTo(2, 1)
  })

  it('tries a PNG exact first, then fewer colours, then smaller', async () => {
    const { encoders, calls } = fake()
    const made = await compressPixels(
      picture(200, 100),
      'png',
      { under: 4000 },
      encoders,
    )
    expect(calls.slice(0, 2)).toEqual(['exact 200', 'colours 200 0-100'])
    expect(made!.bytes.length).toBeLessThanOrEqual(4000)
    expect(made!.width).toBeLessThan(200)
  })

  it('gives up rather than make a picture tiny', async () => {
    const { encoders } = fake()
    expect(
      await compressPixels(picture(40, 40), 'jpeg', { under: 10 }, encoders),
    ).toBeUndefined()
  })
})
