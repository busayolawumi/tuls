"""A PDF's text map, repaired: shared by PDF to Word and PDF to Excel.

    configure_ligatures(fonts_json)   # once: officeFonts.json
    repair_text_map(doc)
"""

import json
import logging
import re

# Ligature widths by PostScript name (width in 1/1000 em -> texts),
# measured from Office's and Windows' fonts (officeFonts.json).
LIGATURES = {}


def configure_ligatures(fonts_json):
    LIGATURES.clear()
    for font, widths in json.loads(fonts_json)['ligatures'].items():
        LIGATURES[font] = {int(width): texts for width, texts in widths.items()}


# ---------------------------------------------------------------------------
# Repairing the text map
#
# Office fonts join some letter pairs into one glyph (Calibri's "ti", "tt",
# "tti", "ft"...). Unicode has characters for a few ligatures (fi, fl, ff,
# ffi, ffl), so a PDF's text map (ToUnicode) can name those. For the rest,
# Acrobat and Word leave the glyph out of the text map, and every reader
# falls back to the glyph's code as a character: "Evaluation" reads
# "Evalua7on", "Battle" "Ba>le". The glyph's width still tells which ligature
# it is: in each font, these ligatures' widths differ (ligatures.json, from
# Office's own fonts). So each code missing from the text map whose width is
# exactly one of the font's ligatures gets that ligature's letters.
# ---------------------------------------------------------------------------

HEX = re.compile(r'<([0-9A-Fa-f]*)>')


def _unicode(hex_text):
    data = bytes.fromhex(hex_text)
    return data.decode('utf-16-be', errors='replace')


def parse_cmap(text):
    """A ToUnicode CMap's codes -> text, and its codes' length in bytes."""
    codes = {}
    length = 1
    space = re.search(r'begincodespacerange(.*?)endcodespacerange', text, re.S)
    if space:
        found = HEX.findall(space.group(1))
        if found:
            length = max(1, len(found[0]) // 2)
    for block in re.findall(r'beginbfchar(.*?)endbfchar', text, re.S):
        pairs = HEX.findall(block)
        for source, target in zip(pairs[0::2], pairs[1::2]):
            codes[int(source, 16)] = _unicode(target)
    for block in re.findall(r'beginbfrange(.*?)endbfrange', text, re.S):
        for low, high, rest in re.findall(
            r'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])',
            block,
        ):
            low, high = int(low, 16), int(high, 16)
            if rest.startswith('['):
                for offset, target in enumerate(HEX.findall(rest)):
                    codes[low + offset] = _unicode(target)
            else:
                start = bytes.fromhex(rest[1:-1])
                for offset in range(high - low + 1):
                    # The last byte counts up.
                    value = start[:-1] + bytes([(start[-1] + offset) & 0xFF])
                    codes[low + offset] = value.decode('utf-16-be', errors='replace')
    return codes, length


def _numbers(text):
    """The numbers and nested arrays of a PDF array, as Python lists."""
    tokens = re.findall(r'\[|\]|-?\d+\.?\d*', text)
    stack = [[]]
    for token in tokens:
        if token == '[':
            stack.append([])
        elif token == ']':
            if len(stack) > 1:
                done = stack.pop()
                stack[-1].append(done)
        else:
            stack[-1].append(float(token))
    result = stack[0]
    return result[0] if len(result) == 1 and isinstance(result[0], list) else result


def _value(doc, xref, key):
    """A key's value, following an indirect reference."""
    kind, value = doc.xref_get_key(xref, key)
    if kind == 'xref':
        return 'xref', doc.xref_object(int(value.split()[0]))
    return kind, value


def font_widths(doc, xref):
    """Each code's width (1/1000 em), for simple and CID fonts."""
    widths = {}
    subtype = doc.xref_get_key(xref, 'Subtype')[1]
    if subtype == '/Type0':
        kind, value = doc.xref_get_key(xref, 'DescendantFonts')
        refs = re.findall(r'(\d+) 0 R', value if kind != 'xref' else value)
        if kind == 'xref':
            refs = re.findall(r'(\d+) 0 R', doc.xref_object(int(value.split()[0])))
        if not refs:
            return widths
        descendant = int(refs[0])
        kind, w = _value(doc, descendant, 'W')
        if kind == 'null':
            return widths
        items = _numbers(w)
        i = 0
        while i < len(items):
            first = items[i]
            if i + 1 < len(items) and isinstance(items[i + 1], list):
                for offset, width in enumerate(items[i + 1]):
                    widths[int(first) + offset] = width
                i += 2
            elif i + 2 < len(items):
                for code in range(int(first), int(items[i + 1]) + 1):
                    widths[code] = items[i + 2]
                i += 3
            else:
                break
        return widths
    kind, first = doc.xref_get_key(xref, 'FirstChar')
    if kind != 'int':
        return widths
    kind, value = _value(doc, xref, 'Widths')
    if kind in ('null', ''):
        return widths
    for offset, width in enumerate(_numbers(value)):
        if isinstance(width, float):
            widths[int(first) + offset] = width
    return widths


def font_key(doc, xref):
    """The font's PostScript name, e.g. Calibri-Bold, without a subset tag."""
    name = doc.xref_get_key(xref, 'BaseFont')[1].lstrip('/')
    name = name.split('+')[-1].replace(',', '-')
    return re.sub(r'-Identity-[HV]$', '', name)


def repair_text_map(doc):
    """Adds the missing ligatures to fonts' text maps. Returns how many."""
    added = 0
    for xref in range(1, doc.xref_length()):
        try:
            if doc.xref_get_key(xref, 'Type')[1] != '/Font':
                continue
            ligatures = LIGATURES.get(font_key(doc, xref))
            kind, value = doc.xref_get_key(xref, 'ToUnicode')
            if not ligatures or kind != 'xref':
                continue
            cmap_xref = int(value.split()[0])
            text = doc.xref_stream(cmap_xref).decode('latin-1')
            codes, length = parse_cmap(text)
            missing = {}
            for code, width in font_widths(doc, xref).items():
                if code in codes or width <= 0:
                    continue
                texts = ligatures.get(round(width))
                # Two ligatures of one width can't be told apart: leave it.
                if texts and len(texts) == 1:
                    missing[code] = texts[0]
            if not missing or 'endcmap' not in text:
                continue
            entries = ''.join(
                '<%0*X> <%s>\n' % (length * 2, code, ligature.encode('utf-16-be').hex().upper())
                for code, ligature in sorted(missing.items())
            )
            # A CMap block holds at most 100 entries; these are a handful.
            block = '%d beginbfchar\n%sendbfchar\n' % (len(missing), entries)
            doc.update_stream(cmap_xref, text.replace('endcmap', block + 'endcmap', 1).encode('latin-1'))
            added += len(missing)
        except Exception as error:  # a font Tuls can't read is left as it was
            logging.debug('Text map of font %s left alone: %s', xref, error)
    return added
