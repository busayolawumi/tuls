# Fonts for the LibreOffice engine

Extra fonts that Tuls gives LibreOffice when it starts (`plugins/libreoffice.ts`).

## StandardSymbolsPS-Symbol.ttf

Word's default bullets use the Symbol font. LibreOffice's engine has no Symbol font, so it draws them with its own OpenSymbol, which is shorter. Bulleted lines then come out shorter than in Word, and over a page that moves the page breaks.

This is URW++'s Standard Symbols PS, a free substitute for Symbol, from the URW base 35 fonts:

- Source: https://github.com/ArtifexSoftware/urw-base35-fonts, `fonts/StandardSymbolsPS.ttf` at commit `c1e3ec2886de92b8898f90e4dad9926549bb28a5` (SHA-256 of the original starts `cbb297e02aff8f30`).
- Licence: GNU AGPL 3.0 with a font exception (see `LICENSE` here), so PDFs that include it can be under any licence.

Tuls changed two things:

1. **The family name is "Symbol"** (name IDs 1 and 16), so LibreOffice uses it for Symbol-font text instead of switching to OpenSymbol. The PostScript and full names are unchanged, so PDFs name it StandardSymbolsPS.
2. **The line metrics are Symbol's proportions** (Monotype SymbolMT: hhea ascent 1436 and descent 612 per 2048 units, OS/2 win ascent 1694 and descent 612), scaled to this font's 1000 units. With the original metrics, bulleted lines came out taller than in Word.

The change, with fontTools:

```python
from fontTools.ttLib import TTFont
f = TTFont('StandardSymbolsPS.ttf')
for rec in f['name'].names:
    if rec.nameID in (1, 16):
        rec.string = 'Symbol'
upm = f['head'].unitsPerEm
s = lambda v: round(v * upm / 2048)
f['hhea'].ascent, f['hhea'].descent, f['hhea'].lineGap = s(1436), -s(612), 0
o = f['OS/2']
o.usWinAscent, o.usWinDescent = s(1694), s(612)
o.sTypoAscender, o.sTypoDescender, o.sTypoLineGap = s(1436), -s(612), 0
f.save('StandardSymbolsPS-Symbol.ttf')
```

Checked against a CV exported by Word for Mac: with this font, LibreOffice breaks the pages where Word does, and the bulleted lines take the same total height.
