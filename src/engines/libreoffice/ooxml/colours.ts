import { attr, child, children } from './xml'

// DrawingML colours, worked out to red, green, blue and opacity, for the
// few places Tuls draws a colour LibreOffice can't (charts.ts). A colour is
// a base (a hex value, one of the theme's colours, or a system colour) and
// changes to it, e.g. `lumMod` for "Lighter 25%". Only the changes Office's
// chart styles use are understood; anything else gives undefined, and the
// file is left as it was.

/** 0–255 each, and opacity 0–1. */
export type Rgba = { r: number; g: number; b: number; a: number }

/** A theme's colours by name (dk1, lt1, accent1…), as hex. */
export type ThemeColours = Record<string, string>

const SCHEME = [
  'dk1',
  'lt1',
  'dk2',
  'lt2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
]

/** The colours of a theme part (e.g. ppt/theme/theme1.xml). */
export function themeColours(themeXml: string): ThemeColours {
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(themeXml)?.[0]
  const colours: ThemeColours = {}
  if (!scheme) return colours
  for (const name of SCHEME) {
    const slot = /^<[^>]*>([\s\S]*)<\/[^>]*>$/.exec(
      new RegExp(`<a:${name}>[\\s\\S]*?</a:${name}>`).exec(scheme)?.[0] ?? '',
    )?.[1]
    const colour = slot ? children(slot)[0] : undefined
    const hex =
      colour?.name === 'a:srgbClr'
        ? attr(colour.tag, 'val')
        : colour?.name === 'a:sysClr'
          ? attr(colour.tag, 'lastClr')
          : undefined
    if (hex && /^[0-9A-Fa-f]{6}$/.test(hex)) colours[name] = hex
  }
  return colours
}

/**
 * Which theme colour text and background names stand for. This is the
 * usual mapping; PowerPoint slide masters can change it (p:clrMap).
 */
export const USUAL_MAP: Record<string, string> = {
  bg1: 'lt1',
  tx1: 'dk1',
  bg2: 'lt2',
  tx2: 'dk2',
}

/** A slide master's colour mapping (p:clrMap), or the usual one. */
export function colourMap(masterXml: string | undefined) {
  const tag = masterXml && /<p:clrMap\b[^>]*>/.exec(masterXml)?.[0]
  if (!tag) return USUAL_MAP
  const map: Record<string, string> = {}
  for (const name of Object.keys(USUAL_MAP)) {
    map[name] = attr(tag, name) ?? USUAL_MAP[name]
  }
  return map
}

const hexToRgba = (hex: string): Rgba => ({
  r: parseInt(hex.slice(0, 2), 16),
  g: parseInt(hex.slice(2, 4), 16),
  b: parseInt(hex.slice(4, 6), 16),
  a: 1,
})

/** Changes luminance in HSL, as Office's lumMod and lumOff do. */
function withLuminance(
  { r, g, b, a }: Rgba,
  change: (luminance: number) => number,
) {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  let hue = 0
  let saturation = 0
  const luminance = (max + min) / 2
  if (max !== min) {
    const d = max - min
    saturation = luminance > 0.5 ? d / (2 - max - min) : d / (max + min)
    hue =
      max === red
        ? (green - blue) / d + (green < blue ? 6 : 0)
        : max === green
          ? (blue - red) / d + 2
          : (red - green) / d + 4
    hue /= 6
  }
  const l = Math.min(1, Math.max(0, change(luminance)))
  if (saturation === 0) {
    return { r: l * 255, g: l * 255, b: l * 255, a }
  }
  const q = l < 0.5 ? l * (1 + saturation) : l + saturation - l * saturation
  const p = 2 * l - q
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  return {
    r: channel(hue + 1 / 3) * 255,
    g: channel(hue) * 255,
    b: channel(hue - 1 / 3) * 255,
    a,
  }
}

/**
 * One colour element (a:srgbClr, a:schemeClr or a:sysClr, with its
 * changes) as RGBA, or undefined if Tuls can't be sure what it is.
 */
export function resolveColour(
  colourXml: string,
  theme: ThemeColours,
  map = USUAL_MAP,
): Rgba | undefined {
  const [colour] = children(colourXml)
  if (!colour) return undefined
  let hex: string | undefined
  if (colour.name === 'a:srgbClr') hex = attr(colour.tag, 'val')
  else if (colour.name === 'a:sysClr') hex = attr(colour.tag, 'lastClr')
  else if (colour.name === 'a:schemeClr') {
    const name = attr(colour.tag, 'val') ?? ''
    hex = theme[map[name] ?? name]
  }
  if (!hex || !/^[0-9A-Fa-f]{6}$/.test(hex)) return undefined
  let rgba = hexToRgba(hex)
  for (const change of children(colour.inner)) {
    const value = Number(attr(change.tag, 'val')) / 100_000
    if (!Number.isFinite(value)) return undefined
    if (change.name === 'a:lumMod') {
      rgba = withLuminance(rgba, (l) => l * value)
    } else if (change.name === 'a:lumOff') {
      rgba = withLuminance(rgba, (l) => l + value)
    } else if (change.name === 'a:alpha') {
      rgba = { ...rgba, a: Math.min(1, Math.max(0, value)) }
    } else {
      return undefined
    }
  }
  return rgba
}

/**
 * A gradient's average colour (what's inside an a:gradFill), weighting
 * each colour by its opacity: what a thin line drawn with it looks like.
 */
export function averageColour(
  gradientXml: string,
  theme: ThemeColours,
  map = USUAL_MAP,
): Rgba | undefined {
  const list = child(gradientXml, 'a:gsLst')
  if (!list) return undefined
  const stops: { at: number; colour: Rgba }[] = []
  for (const stop of children(list.inner)) {
    const colour = resolveColour(stop.inner, theme, map)
    const at = Number(attr(stop.tag, 'pos')) / 100_000
    if (stop.name !== 'a:gs' || !colour || !Number.isFinite(at)) {
      return undefined
    }
    stops.push({ at: Math.min(1, Math.max(0, at)), colour })
  }
  if (stops.length === 0) return undefined
  stops.sort((x, y) => x.at - y.at)
  // Before the first stop and after the last, their colours carry on.
  const spans = [
    { from: stops[0], to: stops[0], length: stops[0].at },
    ...stops.slice(1).map((to, i) => ({
      from: stops[i],
      to,
      length: to.at - stops[i].at,
    })),
    {
      from: stops.at(-1)!,
      to: stops.at(-1)!,
      length: 1 - stops.at(-1)!.at,
    },
  ]
  let alpha = 0
  const sum = { r: 0, g: 0, b: 0 }
  for (const { from, to, length } of spans) {
    alpha += ((from.colour.a + to.colour.a) / 2) * length
    for (const key of ['r', 'g', 'b'] as const) {
      sum[key] +=
        ((from.colour[key] * from.colour.a + to.colour[key] * to.colour.a) /
          2) *
        length
    }
  }
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 }
  return { r: sum.r / alpha, g: sum.g / alpha, b: sum.b / alpha, a: alpha }
}

/** RGBA as a DrawingML colour, e.g. for an a:solidFill. */
export function srgbColour({ r, g, b, a }: Rgba) {
  const hex = [r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  const opacity = Math.round(a * 100_000)
  return opacity >= 100_000
    ? `<a:srgbClr val="${hex}"/>`
    : `<a:srgbClr val="${hex}"><a:alpha val="${opacity}"/></a:srgbClr>`
}
