// iPhones won't draw on a canvas much bigger than 16.7 million pixels, so
// pages are never drawn bigger than this.
export const MAX_PIXELS = 16_000_000

/**
 * How many times bigger than its size in points (1/72 inch) to draw a page
 * for `dpi` dots per inch, kept under MAX_PIXELS.
 */
export function imageScale(width: number, height: number, dpi: number) {
  const scale = dpi / 72
  const pixels = width * height * scale * scale
  return pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / (width * height)) : scale
}
