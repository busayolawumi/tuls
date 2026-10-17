import { describe, expect, it } from 'vitest'
import {
  averageColour,
  colourMap,
  resolveColour,
  srgbColour,
  themeColours,
} from './colours'

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const theme = themeColours(
  `<a:theme ${A}><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme></a:themeElements></a:theme>`,
)
const hex = (xml: string, map?: Record<string, string>) => {
  const colour = resolveColour(xml, theme, map)
  return colour && srgbColour(colour)
}

describe('DrawingML colours', () => {
  it('reads a theme’s colours, system ones by their last value', () => {
    expect(theme).toEqual({
      dk1: '000000',
      lt1: 'FFFFFF',
      dk2: '44546A',
      lt2: 'E7E6E6',
      accent1: '4472C4',
    })
  })

  it('works out colours as Office shows them', () => {
    expect(hex('<a:srgbClr val="ff8000"/>')).toBe('<a:srgbClr val="FF8000"/>')
    // "Lighter 40%" of Office's blue, which Office shows as 8FAADC.
    expect(
      hex(
        '<a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr>',
      ),
    ).toBe('<a:srgbClr val="8FAADC"/>')
    // "Darker 25%" of white.
    expect(
      hex('<a:schemeClr val="bg1"><a:lumMod val="75000"/></a:schemeClr>'),
    ).toBe('<a:srgbClr val="BFBFBF"/>')
    expect(
      hex('<a:schemeClr val="tx1"><a:alpha val="42000"/></a:schemeClr>'),
    ).toBe('<a:srgbClr val="000000"><a:alpha val="42000"/></a:srgbClr>')
  })

  it('follows a slide master’s colour mapping', () => {
    // A dark master: text is the light colour.
    const dark = colourMap(
      '<p:sldMaster><p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1"/></p:sldMaster>',
    )
    expect(hex('<a:schemeClr val="tx1"/>', dark)).toBe(
      '<a:srgbClr val="FFFFFF"/>',
    )
    expect(colourMap(undefined).tx1).toBe('dk1')
  })

  it('gives up on what it doesn’t know', () => {
    expect(
      hex('<a:schemeClr val="accent1"><a:satMod val="50000"/></a:schemeClr>'),
    ).toBeUndefined()
    expect(hex('<a:prstClr val="black"/>')).toBeUndefined()
    expect(hex('<a:schemeClr val="accent6"/>')).toBeUndefined()
    expect(hex('')).toBeUndefined()
  })

  it('averages a gradient, weighting each colour by its opacity', () => {
    // The gridlines of one of Office's chart styles: light grey at 36% to
    // near-black at 42%.
    const gridlines =
      '<a:gsLst><a:gs pos="100000"><a:schemeClr val="dk1"><a:lumMod val="95000"/><a:lumOff val="5000"/><a:alpha val="42000"/></a:schemeClr></a:gs><a:gs pos="0"><a:schemeClr val="lt1"><a:lumMod val="75000"/><a:alpha val="36000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/>'
    expect(srgbColour(averageColour(gridlines, theme)!)).toBe(
      '<a:srgbClr val="5F5F5F"><a:alpha val="39000"/></a:srgbClr>',
    )
    // One stop, part of the way along: its colour throughout.
    expect(
      srgbColour(
        averageColour(
          '<a:gsLst><a:gs pos="40000"><a:srgbClr val="336699"/></a:gs></a:gsLst>',
          theme,
        )!,
      ),
    ).toBe('<a:srgbClr val="336699"/>')
    // Black to white, white from halfway: three-quarters white.
    expect(
      srgbColour(
        averageColour(
          '<a:gsLst><a:gs pos="0"><a:srgbClr val="000000"/></a:gs><a:gs pos="50000"><a:srgbClr val="FFFFFF"/></a:gs></a:gsLst>',
          theme,
        )!,
      ),
    ).toBe('<a:srgbClr val="BFBFBF"/>')
    expect(
      averageColour(
        '<a:gsLst><a:gs pos="0"><a:prstClr val="red"/></a:gs></a:gsLst>',
        theme,
      ),
    ).toBeUndefined()
    expect(averageColour('<a:lin ang="0"/>', theme)).toBeUndefined()
  })
})
