"""PDF to Word, the Tuls way: pdf2docx, with a PDF's text map repaired first
and fixes to how pdf2docx writes fonts, superscripts, tables and pictures.

Run by the PDF to Word worker (worker.ts) inside Pyodide, after the
@bentopdf/pymupdf-wasm package has loaded PyMuPDF and pdf2docx. Also runs in
plain Python, with the same package versions, for checking on a computer.
tuls_text_map.py runs first, in the same namespace.

    configure(fonts_json)   # once: officeFonts.json
    convert(pdf_path, docx_path)
"""

import json
import logging
import re

import fitz
import docx
from docx.enum.table import WD_ROW_HEIGHT
from docx.enum.text import WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor
from pdf2docx import Converter
from pdf2docx.font.Fonts import Font, Fonts
from pdf2docx.image.ImagesExtractor import ImagesExtractor
from pdf2docx.page.RawPage import RawPage
from pdf2docx.layout.Blocks import Blocks
from pdf2docx.table.Cell import Cell
from pdf2docx.table.Row import Row
from pdf2docx.table.TableBlock import TableBlock
from pdf2docx.text.TextBlock import TextBlock
from pdf2docx.text.TextSpan import TextSpan

def _guarded(addition):
    """Tuls's additions run after pdf2docx's own step, and if one fails,
    pdf2docx's result stands: pdf2docx leaves out a page whose conversion
    fails, so no fix of Tuls's may risk one."""
    def run(*args, **kwargs):
        try:
            return addition(*args, **kwargs)
        except Exception as error:
            logging.debug('Tuls fix %s skipped: %s', addition.__name__, error)
    return run


# Word's line height for a family, as a share of the font size, measured
# from Office's and Windows' fonts (officeFonts.json).
LINE_HEIGHTS = {}


def configure(fonts_json):
    configure_ligatures(fonts_json)
    LINE_HEIGHTS.clear()
    LINE_HEIGHTS.update(json.loads(fonts_json)['lineHeights'])


# ---------------------------------------------------------------------------
# Font names
#
# pdf2docx names fonts after their family name inside the embedded font.
# Subset fonts often have none, which gave "" (and its lookup then matched
# everything to it), or only a PostScript name such as "TimesNewRomanPSMT",
# which Word doesn't know. Tuls turns PostScript names into family names, as
# Word lists them: Arial, Times New Roman, Calibri Light, Segoe UI Semibold.
# ---------------------------------------------------------------------------

# Bold, italic and regular are part of a font, not its name; other weights
# and widths are, on Windows (Calibri Light, Arial Narrow, Segoe UI Semibold).
_STYLES = {'bold', 'italic', 'oblique', 'regular', 'roman', 'normal', 'book', 'plain', 'mt', 'ps', 'psmt'}
_SPECIAL = {
    'GillSans': 'Gill Sans MT',
    'GillSansMT': 'Gill Sans MT',
    'DejaVuSans': 'DejaVu Sans',
    'DejaVuSerif': 'DejaVu Serif',
    'DejaVuSansMono': 'DejaVu Sans Mono',
    'FranklinGothic': 'Franklin Gothic Book',
    'MSGothic': 'MS Gothic',
    'MSMincho': 'MS Mincho',
    'MSPGothic': 'MS PGothic',
    'Symbol': 'Symbol',
    'ZapfDingbats': 'Zapf Dingbats',
    # PDF's standard fonts, by the names Word has for them.
    'Times': 'Times New Roman',
    'Courier': 'Courier New',
}
_WORDS = re.compile(r'Semi[Bb]old|Demi[Bb]old|Extra[Bb]old|Ultra[Bb]old|Extra[Ll]ight|Ultra[Ll]ight|[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+')


def _spaced(name):
    """CamelCase to words: TimesNewRoman -> Times New Roman, SegoeUI -> Segoe UI."""
    return ' '.join(_WORDS.findall(name)) or name


def family_name(name):
    """A font's name as Word knows it, from a PDF or PostScript name."""
    name = (name or '').split('+')[-1].strip()
    if not name:
        return ''
    # The family, then the style after "-" or ",": Arial-BoldMT, Calibri,Bold.
    base, _, style = re.sub(',', '-', name).partition('-')
    base = re.sub(r'(PSMT|PS|MT)$', '', base) or base
    family = _SPECIAL.get(base) or _spaced(base)
    extra = [
        word for word in _WORDS.findall(style)
        if word.lower() not in _STYLES and not re.fullmatch(r'(PS)?MT|PS', word)
    ]
    return ' '.join([family] + extra) if extra else family


_original_extract = Fonts.extract


def _extract(cls, fitz_doc):
    fonts = _original_extract.__func__(cls, fitz_doc)
    try:
        return cls(_named_fonts(cls, fonts))
    except Exception as error:
        logging.debug('Font names left as pdf2docx found them: %s', error)
        return fonts


def _named_fonts(cls, fonts):
    named = []
    for font in fonts:
        name = family_name(font.name) or family_name(font.descriptor)
        if not name:
            continue
        # Word lays text out with the font installed on the computer, not the
        # PDF's subset of it, which often lacks the table pdf2docx reads line
        # heights from, or has it changed: lines came out further apart than
        # in the PDF. Known fonts get their real line height.
        line_height = LINE_HEIGHTS.get(name) or font.line_height
        named.append(Font(descriptor=cls._to_descriptor(name), name=name, line_height=line_height))
    return named


def _get(self, font_name):
    """The embedded font of this family, by its exact name only."""
    target = self._to_descriptor(family_name(font_name))
    for font in self:
        if font.descriptor == target:
            return font
    return None


def _process_font(self, fonts):
    for line in self.blocks:
        for span in line.spans:
            if isinstance(span, TextSpan):
                _name_span(span, fonts)


@_guarded
def _name_span(span, fonts):
    font = fonts.get(span.font)
    span.font = font.name if font else family_name(span.font) or span.font
    line_height = LINE_HEIGHTS.get(span.font) or (font.line_height if font else None)
    if line_height:
        span.line_height = line_height * span.size


# Raw font names (original spelling) come from Fonts.extract's basename,
# normalised by pdf2docx to the part before "-": keep the whole name instead.
Fonts._normalized_font_name = staticmethod(lambda name: name.split('+')[-1])
Fonts.extract = classmethod(_extract)
Fonts.get = _get
RawPage.process_font = _process_font


# ---------------------------------------------------------------------------
# Line spacing
#
# pdf2docx gave every paragraph of more than one line at least 1.02 lines'
# spacing, against overlapping lines when it can't tell a font's height. With
# real line heights (above), the PDF's own spacing is known: the distance
# from one line to the next over the font's line height. A whole page of
# Calibri came out a line longer than the PDF's, and pushed its last line
# onto a page of its own.
# ---------------------------------------------------------------------------

_original_relative = TextBlock.parse_relative_line_spacing


def _parse_relative_line_spacing(self):
    _original_relative(self)
    _measured_line_spacing(self)


@_guarded
def _measured_line_spacing(self):
    rows = self.lines.group_by_physical_rows()
    if len(rows) < 2 or self.line_space == 1.02 and any(
        not isinstance(span, TextSpan) for line in self.lines for span in line.spans
    ):
        return
    idx = 1 if self.is_horizontal_text else 0
    bottoms = [max(line.bbox[idx + 2] for line in row) for row in rows]
    pitch = (bottoms[-1] - bottoms[0]) / (len(rows) - 1)
    heights = [
        max(span.line_height for line in row for span in line.spans if isinstance(span, TextSpan))
        for row in rows
        if any(isinstance(span, TextSpan) for line in row for span in line.spans)
    ]
    standard = sum(heights) / len(heights) if heights else 0
    if pitch > 0 and standard > 0:
        self.line_space = max(pitch / standard, 0.8)


TextBlock.parse_relative_line_spacing = _parse_relative_line_spacing


# ---------------------------------------------------------------------------
# Superscripts
#
# pdf2docx set `run.superscript`, which python-docx doesn't have (it's
# `run.font.superscript`), so footnote marks lost their superscript. Word
# draws superscript text at about two-thirds of the run's size, so the run
# gets the size of the text around it.
# ---------------------------------------------------------------------------

_SUPERSCRIPT_SCALE = 0.65
_original_text_format = TextSpan._set_text_format


def _set_text_format(self, docx_run):
    _original_text_format(self, docx_run)
    _superscript(self, docx_run)


@_guarded
def _superscript(self, docx_run):
    if self.flags & 1:
        docx_run.font.superscript = True
        docx_run.font.size = Pt(round(self.size / _SUPERSCRIPT_SCALE * 2) / 2)


TextSpan._set_text_format = _set_text_format


# ---------------------------------------------------------------------------
# Tables
#
# pdf2docx gave each cell its width but left the table's column grid with
# equal columns, which Word and LibreOffice lay tables out by: a wide first
# column came out squashed. And it fixed each row's height exactly, so text
# that wraps a little differently in Word was cut off. Rows now grow when
# they need to.
# ---------------------------------------------------------------------------

_original_table = TableBlock.make_docx
_original_row = Row.make_docx
_original_cell = Cell.make_docx


def _make_cell(self, table, indexes):
    _original_cell(self, table, indexes)
    _empty_cell(self, table, indexes)


@_guarded
def _empty_cell(self, table, indexes):
    if self.blocks or not bool(self):
        return
    # An empty cell still holds an empty paragraph (Word needs one), which
    # would be as tall as a line of 11 pt text with spacing after it: rows of
    # coloured boxes came out twice as tall as in the PDF. A tiny, unspaced
    # one leaves the row its own height.
    for paragraph in table.cell(*indexes).paragraphs:
        _tiny(paragraph)


def _tiny(paragraph):
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.0
    pPr = paragraph._p.get_or_add_pPr()
    mark = OxmlElement('w:rPr')
    size = OxmlElement('w:sz')
    size.set(qn('w:val'), '2')
    mark.append(size)
    pPr.append(mark)


def _column_widths(block, count):
    """Each column's width (pt) from the cells that span one column."""
    found = [[] for _ in range(count)]
    for row in block._rows:
        for j, cell in enumerate(row._cells):
            if j >= count or not cell:
                continue
            rows, cols = cell.merged_cells
            if cols == 1:
                x0, _, x1, _ = cell.bbox
                found[j].append(x1 - x0)
    widths = [sorted(w)[len(w) // 2] if w else None for w in found]
    # Columns only ever in merged cells: share out what their cells leave.
    for row in block._rows:
        for j, cell in enumerate(row._cells):
            if not cell or j >= count:
                continue
            rows, cols = cell.merged_cells
            span = range(j, min(j + cols, count))
            unknown = [k for k in span if widths[k] is None]
            if cols > 1 and unknown:
                x0, _, x1, _ = cell.bbox
                left = (x1 - x0) - sum(widths[k] for k in span if widths[k] is not None)
                for k in unknown:
                    widths[k] = max(left / len(unknown), 1)
    return widths


def _make_table(self, table):
    _original_table(self, table)
    _set_column_widths(self, table)


@_guarded
def _set_column_widths(self, table):
    widths = _column_widths(self, len(table.columns))
    for column, width in zip(table.columns, widths):
        if width:
            column.width = Pt(width)


def _make_row(self, table, idx_row):
    _original_row(self, table, idx_row)
    _growing_row(table, idx_row)


@_guarded
def _growing_row(table, idx_row):
    table.rows[idx_row].height_rule = WD_ROW_HEIGHT.AT_LEAST


def _content_top(block):
    """The top of the first thing inside a table, nested tables included."""
    tops = []
    for row in block._rows:
        for cell in row._cells:
            if not cell:
                continue
            for inner in cell.blocks:
                # Cells may still hold lines, not paragraphs, at this stage.
                nested = getattr(inner, 'is_table_block', False)
                tops.append(_content_top(inner) if nested else inner.bbox[1])
    return min(tops) if tops else block.bbox[1]


_original_vertical = Blocks._parse_block_vertical_spacing


def _parse_block_vertical_spacing(self):
    """pdf2docx's spacing, but a table is placed by where its content starts.

    pdf2docx sometimes builds a table from a box drawn lower on the page than
    the content it then puts inside (a budget sheet's coloured rows): placed
    by the box's top, everything in it came out lower than in the PDF, and
    pushed the page's last lines onto a page of their own. Rows grow to fit
    their content, so starting the table at its content's top is safe.
    """
    _original_vertical(self)
    try:
        if not self.is_horizontal_text:
            return
        previous = None
        for block in self._instances:
            if getattr(block, 'is_table_block', False):
                above = block.bbox[1] - _content_top(block)
                if above > 1:
                    if previous is not None and (previous.is_text_block or previous.is_inline_image_block):
                        previous.after_space = max(previous.after_space - above, 0.0)
                    else:
                        block.before_space = max(block.before_space - above, 0.0)
            previous = block
    except Exception as error:  # pdf2docx's own spacing stands
        logging.debug('Table placement left as it was: %s', error)


Blocks._parse_block_vertical_spacing = _parse_block_vertical_spacing
TableBlock.make_docx = _make_table
Row.make_docx = _make_row
Cell.make_docx = _make_cell


# ---------------------------------------------------------------------------
# Pictures
#
# pdf2docx decoded every picture and saved it again as a PNG: a 200 KB JPEG
# photo or scan became 2–3 MB, with no gain. A JPEG the PDF shows as it is
# (no mask, grey or RGB, page not rotated) now goes in unchanged. Pictures in
# other colour spaces are turned into RGB, as PNG can't hold CMYK.
# ---------------------------------------------------------------------------

_original_recover = ImagesExtractor._recover_pixmap
_original_raw_dict = ImagesExtractor._to_raw_dict
_jpegs = {}


def _recover_pixmap(doc, item):
    pix = _original_recover(doc, item)
    _keep_jpeg(doc, item, pix)
    return pix


@_guarded
def _keep_jpeg(doc, item, pix):
    xref, smask, filters = item[0], item[1], item[8]
    if smask != 0 or filters != 'DCTDecode':
        return
    image = doc.extract_image(xref)
    # Grey or RGB, with or without a colour profile (most phone and camera
    # photos have one); CMYK is made RGB, as Word shows it better.
    if image.get('ext') in ('jpeg', 'jpg') and image.get('colorspace') in (1, 3):
        _jpegs[id(pix)] = image['image']


def _to_raw_dict(image, bbox):
    raw = _original_raw_dict(image, bbox)
    _picture_bytes(image, raw)
    return raw


@_guarded
def _picture_bytes(image, raw):
    jpeg = _jpegs.pop(id(image), None)
    if jpeg:
        raw['image'] = jpeg
    elif image.colorspace and image.colorspace.n not in (1, 3):
        rgb = fitz.Pixmap(fitz.csRGB, image)
        raw['image'] = rgb.tobytes()


ImagesExtractor._recover_pixmap = staticmethod(_recover_pixmap)
ImagesExtractor._to_raw_dict = staticmethod(_to_raw_dict)


# ---------------------------------------------------------------------------
# Running headers and footers
#
# pdf2docx writes a page's footer ("Report title … Page 3 of 17") as ordinary
# text at the bottom of the page, so when Word lays the page out a little
# taller, the footer is pushed onto a page of its own. Text that repeats at
# the top or bottom of several pages (numbers aside) is a running header or
# footer: Tuls takes it out of the page before pdf2docx sees it, and puts it
# in that page's Word header or footer, where it was, word for word.
# ---------------------------------------------------------------------------

# How far from the top or bottom edge, as a share of the page's height.
BAND = 0.12


def _rows(page):
    """The page's lines near the top and bottom, grouped into rows by height."""
    height = page.rect.height
    lines = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            if not text:
                continue
            x0, y0, x1, y1 = line['bbox']
            if y1 < height * BAND:
                place = 'header'
            elif y0 > height * (1 - BAND):
                place = 'footer'
            else:
                continue
            lines.append({'place': place, 'bbox': fitz.Rect(line['bbox']), 'spans': line['spans'], 'text': text})
    rows = []
    for line in sorted(lines, key=lambda item: (item['bbox'].y0, item['bbox'].x0)):
        for row in rows:
            if row['place'] == line['place'] and abs(row['bbox'].y1 - line['bbox'].y1) < 3:
                row['lines'].append(line)
                row['bbox'] |= line['bbox']
                break
        else:
            rows.append({'place': line['place'], 'bbox': fitz.Rect(line['bbox']), 'lines': [line]})
    for row in rows:
        row['lines'].sort(key=lambda item: item['bbox'].x0)
        row['text'] = re.sub(r'\s+', ' ', ' '.join(item['text'] for item in row['lines']))
        row['size'] = max(span['size'] for line in row['lines'] for span in line['spans'])
        # The same footer, numbers aside, at the same height.
        row['key'] = (row['place'], round(row['bbox'].y1 / 4), re.sub(r'\d+', '#', row['text']))
    return rows


def _body_size(doc):
    """The size most of the document's text is set in."""
    sizes = {}
    for page in doc:
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines', []):
                for span in line['spans']:
                    size = round(span['size'] * 2) / 2
                    sizes[size] = sizes.get(size, 0) + len(span['text'].strip())
    return max(sizes, key=sizes.get) if sizes else 0


def _numbered_like_pages(occurrences):
    """Whether rows that differ only in their numbers count up with the pages,
    as page numbers do ("Page 3 of 17"), rather than being different text
    that happens to look alike ("Chapter 2", "Table 7")."""
    texts = [row['text'] for _, row in occurrences]
    if len(set(texts)) == 1:
        return True
    numbers = [re.findall(r'\d+', text) for text in texts]
    if len({len(found) for found in numbers}) != 1:
        return False
    pages = [number for number, _ in occurrences]
    for place in range(len(numbers[0])):
        if len({int(found[place]) - page for found, page in zip(numbers, pages)}) == 1:
            return True
    return False


def _content(page, running_lines):
    """Where everything else on the page is: text, pictures and drawings."""
    boxes = []
    for block in page.get_text('dict')['blocks']:
        if block.get('type') == 1:
            boxes.append(fitz.Rect(block['bbox']))
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            box = fitz.Rect(line['bbox'])
            if text and not any(box == other for other in running_lines):
                boxes.append(box)
    for drawing in page.get_drawings():
        box = fitz.Rect(drawing['rect'])
        # Lines and boxes with some size, not hairline specks.
        if box.width > 2 or box.height > 2:
            boxes.append(box)
    return boxes


def find_running_rows(doc):
    """Each page's running header and footer rows: {page: [row, ...]}.

    Only rows outside the page's content: a footer inside a box drawn round
    the whole page stays where it is, as moving it would leave the box too
    tall for the page.
    """
    rows = {number: _rows(page) for number, page in enumerate(doc)}
    occurrences = {}
    for number, page_rows in rows.items():
        for row in page_rows:
            occurrences.setdefault(row['key'], []).append((number, row))
    body = _body_size(doc)
    # On at least 3 pages, no bigger than the body text (headings are), and
    # with any changing numbers counting up like page numbers.
    keys = {
        key for key, found in occurrences.items()
        if len({number for number, _ in found}) >= 3
        and all(row['size'] <= body + 0.5 for _, row in found)
        and _numbered_like_pages(found)
    }
    running = {}
    for number, page_rows in rows.items():
        mine = [row for row in page_rows if row['key'] in keys]
        if not mine:
            continue
        lines = [line['bbox'] for row in mine for line in row['lines']]
        content = _content(doc[number], lines)
        kept = []
        for place in ('header', 'footer'):
            band = [row for row in mine if row['place'] == place]
            if not band:
                continue
            if place == 'header':
                edge = max(row['bbox'].y1 for row in band)
                clear = all(box.y0 >= edge - 1 for box in content)
            else:
                edge = min(row['bbox'].y0 for row in band)
                clear = all(box.y1 <= edge + 1 for box in content)
            if clear:
                kept.extend(band)
        if kept:
            running[number] = kept
    return running


# Word's height for a line of text, as a share of its size (Calibri's is
# 1.22; Arial's and Times New Roman's 1.15). A little over is harmless.
LINE = 1.25

# Word draws a page's content a point or two taller or shorter than the PDF,
# and a page whose last line sits just above the footer would spill onto a
# page of its own. So the body gets ROOM (pt) below its last line: where the
# footer is closer than that, it sits lower than in the PDF, by just enough,
# but no closer than EDGE to the page's edge.
ROOM = 10
EDGE = 12

# Each page's room for its header and footer (pt), for the margins.
_bands = {}


def _band_heights(rows):
    return sum(LINE * max(span['size'] for line in row['lines'] for span in line['spans']) for row in rows)


def measure_bands(doc, running):
    """Where each page's running header ends and footer starts, in Word."""
    _bands.clear()
    for number, rows in running.items():
        height = doc[number].rect.height
        band = {}
        headers = [row for row in rows if row['place'] == 'header']
        footers = [row for row in rows if row['place'] == 'footer']
        if headers:
            top = min(row['bbox'].y0 for row in headers)
            band['header_top'] = top
            band['header_end'] = top + _band_heights(headers)
        if footers:
            top = min(row['bbox'].y0 for row in footers)
            bottom = max(row['bbox'].y1 for row in footers)
            lines = [line['bbox'] for row in rows for line in row['lines']]
            content = [box.y1 for box in _content(doc[number], lines) if box.y1 <= top + 1]
            body_bottom = max(content) if content else 0
            lower = min(max(body_bottom + ROOM - top, 0), max(height - bottom - EDGE, 0))
            band['footer_top'] = top + lower
            band['footer_distance'] = max(height - top - lower - _band_heights(footers), 0)
        _bands[number] = band


_original_margin = RawPage.calculate_margin


def _calculate_margin(self, **settings):
    """pdf2docx's margins, with room for the running header and footer."""
    margins = _original_margin(self, **settings)
    return _band_margins(self, margins) or margins


@_guarded
def _band_margins(self, margins):
    left, right, top, bottom = margins
    page = self.page_engine
    band = _bands.get(page.number) if page is not None else None
    if not band:
        return left, right, top, bottom
    x0, y0, x1, y1 = self.bbox
    shapes = [shape for shape in self.shapes]
    content = self.blocks.bbox
    for shape in shapes:
        content |= shape.bbox
    if 'header_end' in band:
        # Below the header, but no lower than the page's first line.
        body_top = content.y0 - y0 if not content.is_empty else band['header_end']
        top = round(min(max(top, band['header_end']), max(body_top, band['header_end'])), 1)
    if 'footer_top' in band:
        # The body may run down to the footer, as on the PDF's page.
        bottom = round(max(y1 - band['footer_top'], 0), 1)
    return left, right, top, bottom


RawPage.calculate_margin = _calculate_margin


def remove_rows(doc, running):
    """Takes the running rows' text out of the pages, leaving drawings and pictures."""
    for number, rows in running.items():
        page = doc[number]
        for row in rows:
            for line in row['lines']:
                page.add_redact_annot(line['bbox'] + (0.5, 0.5, -0.5, -0.5))
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        )


def _write_row(paragraph, row, left_margin, right_edge, normal):
    """A row's text in one paragraph: its pieces at their places, by tab stops."""
    # Plain: the template's Header and Footer styles bring tab stops of their
    # own, which Word would jump to before Tuls's.
    paragraph.style = normal
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    stops = paragraph.paragraph_format.tab_stops
    first = True
    for line in row['lines']:
        x0, x1 = line['bbox'].x0 - left_margin, line['bbox'].x1 - left_margin
        if first:
            paragraph.paragraph_format.left_indent = Pt(max(x0, 0))
        elif abs(x1 - right_edge) < 6:
            stops.add_tab_stop(Pt(right_edge), WD_TAB_ALIGNMENT.RIGHT)
            paragraph.add_run('\t')
        else:
            stops.add_tab_stop(Pt(max(x0, 0)), WD_TAB_ALIGNMENT.LEFT)
            paragraph.add_run('\t')
        first = False
        for span in line['spans']:
            if not span['text']:
                continue
            run = paragraph.add_run(span['text'])
            run.font.name = family_name(span['font'])
            run._element.rPr.rFonts.set(qn('w:eastAsia'), run.font.name)
            run.font.size = Pt(round(span['size'] * 2) / 2)
            run.font.bold = bool(span['flags'] & 16)
            run.font.italic = bool(span['flags'] & 2)
            color = span.get('color', 0)
            run.font.color.rgb = RGBColor((color >> 16) & 255, (color >> 8) & 255, color & 255)


def add_running_rows(docx_path, running, page_sizes, made):
    """Puts each page's running rows into its section's header and footer.

    `made` lists the pages pdf2docx made, one section each. Returns False if
    the sections don't match them, and the rows can't be put back.
    """
    if not running:
        return True
    document = docx.Document(docx_path)
    sections = document.sections
    if len(sections) != len(made):
        return False
    for number, section in zip(made, sections):
        width, height = page_sizes[number]
        rows = running.get(number, [])
        band = _bands.get(number, {})
        left = section.left_margin.pt if section.left_margin is not None else 72
        right = section.right_margin.pt if section.right_margin is not None else 72
        right_edge = width - left - right
        for place in ('header', 'footer'):
            part = section.header if place == 'header' else section.footer
            # Every page gets its own: linked, a page would show the last one's.
            part.is_linked_to_previous = False
            for paragraph in part.paragraphs[1:]:
                paragraph._p.getparent().remove(paragraph._p)
            mine = [row for row in rows if row['place'] == place]
            if not mine:
                # Empty, but an empty line still takes a line's room: none.
                _tiny(part.paragraphs[0])
                margin = section.top_margin if place == 'header' else section.bottom_margin
                distance = Pt(max(min(36, (margin.pt if margin is not None else 36) - 2), 0))
                if place == 'header':
                    section.header_distance = distance
                else:
                    section.footer_distance = distance
                continue
            for i, row in enumerate(mine):
                paragraph = part.paragraphs[0] if i == 0 else part.add_paragraph()
                _write_row(paragraph, row, left, right_edge, document.styles['Normal'])
            if place == 'header':
                section.header_distance = Pt(band.get('header_top', mine[0]['bbox'].y0))
            else:
                section.footer_distance = Pt(band.get('footer_distance', max(height - mine[-1]['bbox'].y1, 0)))
    document.save(docx_path)
    return True


# ---------------------------------------------------------------------------

# Areas pdf2docx copies as pictures (vector drawings, overlapping images),
# in points × this: 216 dpi, sharp in print, a third of the size of 288.
CLIP_RESOLUTION = 3.0


class _LeftOut(logging.Handler):
    """Notes the pages pdf2docx leaves out ("Ignore page 12 due to…")."""

    def __init__(self):
        super().__init__(logging.ERROR)
        self.pages = set()

    def emit(self, record):
        if str(record.msg).startswith('Ignore page') and record.args:
            self.pages.add(int(record.args[0]))


def _pdf2docx(data, docx_path):
    """Runs pdf2docx; returns the pages it left out, numbered from 1."""
    left_out = _LeftOut()
    logging.getLogger().addHandler(left_out)
    _jpegs.clear()
    converter = Converter(stream=data)
    try:
        converter.convert(docx_path, clip_image_res_ratio=CLIP_RESOLUTION)
    finally:
        converter.close()
        _jpegs.clear()
        logging.getLogger().removeHandler(left_out)
    return left_out.pages


def convert(pdf_path, docx_path):
    """Makes the PDF at `pdf_path` into a Word file at `docx_path`.

    Returns JSON: {"leftOut": [pages pdf2docx couldn't convert, from 1]}.
    """
    doc = fitz.open(pdf_path)
    try:
        repaired = repair_text_map(doc)
        if repaired:
            logging.info('Repaired %d ligatures in the text map', repaired)
            # Read the pages again with the repaired text maps.
            doc = fitz.open(stream=doc.tobytes())
        repaired_data = doc.tobytes()
        running = find_running_rows(doc)
        measure_bands(doc, running)
        remove_rows(doc, running)
        page_sizes = [(page.rect.width, page.rect.height) for page in doc]
        data = doc.tobytes() if running else repaired_data
    finally:
        doc.close()
    left_out = _pdf2docx(data, docx_path)
    made = [number for number in range(len(page_sizes)) if number + 1 not in left_out]
    _finish(docx_path)
    if not add_running_rows(docx_path, running, page_sizes, made):
        # The headers and footers can't go back where they belong: convert
        # again with them left on their pages, as pdf2docx would.
        logging.info('Converting again with headers and footers in the pages')
        _bands.clear()
        left_out = _pdf2docx(repaired_data, docx_path)
        _finish(docx_path)
    return json.dumps({'leftOut': sorted(left_out)})


@_guarded
def _finish(docx_path):
    _single_spacing(docx_path)


def _single_spacing(docx_path):
    """No spacing by default: python-docx's template adds 10 pt after every
    paragraph and 1.15 lines, which pdf2docx's own paragraphs override but
    any it adds without spacing (between tables, at the ends of pages) don't.

    And the paragraph each page's section break sits in (python-docx adds an
    empty one at the end of every page) takes next to no room: as an empty
    line of 11 pt text, it needed room at the foot of every page, or went
    onto a page of its own.
    """
    document = docx.Document(docx_path)
    defaults = document.styles.element.find(qn('w:docDefaults'))
    spacing = defaults.find('.//' + qn('w:pPrDefault') + '//' + qn('w:spacing')) if defaults is not None else None
    if spacing is not None:
        spacing.set(qn('w:after'), '0')
        spacing.set(qn('w:line'), '240')
        spacing.set(qn('w:lineRule'), 'auto')
    for paragraph in document.paragraphs:
        pPr = paragraph._p.pPr
        if pPr is None or pPr.find(qn('w:sectPr')) is None or paragraph.text.strip():
            continue
        if paragraph._p.findall(qn('w:r')):
            continue
        format = paragraph.paragraph_format
        format.space_before = Pt(0)
        format.space_after = Pt(0)
        format.line_spacing = Pt(0.7)
        mark = OxmlElement('w:rPr')
        size = OxmlElement('w:sz')
        size.set(qn('w:val'), '2')
        mark.append(size)
        pPr.find(qn('w:sectPr')).addprevious(mark)
    document.save(docx_path)
