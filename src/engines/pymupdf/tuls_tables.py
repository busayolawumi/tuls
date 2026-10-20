"""PDF to Excel: finds the tables in a PDF and returns their cells.

tuls_text_map.py runs first, in the same namespace.

    tables(pdf_path)
"""

import json
import logging
import re

import pymupdf

NUMBER = re.compile(r'^[(\-−+]?[£$€₦¥]?\s?\d[\d,.\s]*%?\)?(-|\s?(CR|DR|OD))?$')
AMOUNT = re.compile(r'^[(\-−+]?[£$€₦¥]?\d{1,3}([,.\s]?\d{3})*[.,]\d{2}\)?-?$')
DATE = re.compile(r'^(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}|\d{4}-\d{2}-\d{2})$')
WORD_DATE = re.compile(r'^\d{1,2} [A-Za-z]{3,9}( \d{2,4})?$')


def kind(text):
    text = (text or '').strip()
    if not text:
        return 'empty'
    if DATE.match(text) or WORD_DATE.match(text):
        return 'date'
    if NUMBER.match(text):
        return 'number'
    return 'text'


def _cell(text):
    return ' '.join((text or '').split())


# Ruled tables: MuPDF's own finder, which reads the lines.

def has_lines(page):
    try:
        return any(
            item[0] in ('l', 're', 'qu')
            for path in page.get_cdrawings()
            for item in path.get('items', [])
        )
    except Exception:
        return True


def ruled_tables(page):
    found = []
    for table in page.find_tables().tables:
        rows = table.extract()
        cells = [cell for row in rows for cell in row]
        filled = sum(1 for cell in cells if cell not in (None, ''))
        if table.col_count < 2 or table.row_count < 2 or filled < len(cells) * 0.4:
            continue
        cores = []
        for i in range(table.col_count):
            cells = [row.cells[i] for row in table.rows if row.cells[i]]
            cores.append((min(c[0] for c in cells), max(c[2] for c in cells)) if cells else None)
        found.append({
            'rows': [[None if cell is None else _cell(cell) for cell in row] for row in rows],
            'bbox': list(table.bbox),
            'cores': cores,
        })
    return found


# Tables without lines: columns from where the words sit.

def lines_of(page, skip):
    words = [
        w for w in page.get_text('words')
        if w[4].strip() and not any(pymupdf.Rect(w[:4]).intersects(r) for r in skip)
    ]
    words.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
    lines = []
    for w in words:
        middle = (w[1] + w[3]) / 2
        height = w[3] - w[1]
        if lines and abs(lines[-1]['middle'] - middle) < height * 0.45:
            lines[-1]['words'].append(w)
        else:
            lines.append({'middle': middle, 'height': height, 'words': [w]})
    for line in lines:
        line['words'].sort(key=lambda w: w[0])
        chunks = 0
        last = None
        for w in line['words']:
            if last is None or w[0] - last > (w[3] - w[1]) * 0.9:
                chunks += 1
            last = w[2]
        line['chunks'] = chunks
        line['top'] = min(w[1] for w in line['words'])
        line['bottom'] = max(w[3] for w in line['words'])
    return lines


def regions(lines):
    found, current, between, above = [], [], [], []
    for line in lines:
        if line['chunks'] >= 3:
            last = current[-1] if current else None
            if last and line['top'] - last['bottom'] > line['height'] * (4 if between else 3):
                found.append(current)
                current, between = [], []
            if not current:
                # Short heading lines right above a table belong to it.
                lead = []
                for prior in reversed(above):
                    edge = lead[0] if lead else line
                    if edge['top'] - prior['bottom'] > prior['height'] * 0.5:
                        break
                    lead.insert(0, prior)
                current = lead[-2:]
            current += between + [line]
            between = []
            above = []
        elif current:
            between.append(line)
            if len(between) > 2:
                found.append(current)
                current, between = [], []
                above = list(between)
        else:
            above = (above + [line])[-2:]
    if current:
        found.append(current)
    return [r for r in found if sum(line['chunks'] >= 3 for line in r) >= 3]


def separators(body):
    height = sorted(line['height'] for line in body)[len(body) // 2]
    left = min(w[0] for line in body for w in line['words'])
    right = max(w[2] for line in body for w in line['words'])
    cover = [0] * (int(right - left) + 3)
    for line in body:
        for w in line['words']:
            for x in range(int(w[0] - left), int(w[2] - left) + 1):
                cover[x] += 1
    limit = int(len(body) * 0.06)
    found, start = [], None
    for x, count in enumerate(cover):
        if count <= limit and start is None:
            start = x
        elif count > limit and start is not None:
            if x - start >= height * 0.5 and start > 0:
                found.append((left + start, left + x))
            start = None

    # Cells of a dense spreadsheet touch: a word starting at the same place
    # on most rows, right after a word that doesn't end in the same place, or
    # after a date or an amount.
    starts = {}
    for line in body:
        ws = line['words']
        for a, b in zip(ws, ws[1:]):
            typed = (
                b[0] - a[2] < height * 0.9
                and (DATE.match(a[4]) or AMOUNT.match(a[4]))
                and kind(b[4]) == 'text'
            )
            starts.setdefault(round(b[0]), []).append((a[2], typed))
    for x, before in starts.items():
        near = [e for y in (x - 1, x, x + 1) for e in starts.get(y, [])]
        if any(a <= x <= b for a, b in found):
            continue
        ends = [end for end, _ in near]
        typed = sum(1 for _, t in near if t)
        if typed >= max(3, len(body) * 0.4) or (
            len(near) >= max(3, len(body) * 0.6) and max(ends) - min(ends) > 2
        ):
            found.append((max(ends), x - 0.01))
    found.sort()
    merged = []
    for gap in found:
        if merged and gap[0] - merged[-1][1] < height * 0.3:
            continue
        merged.append(gap)
    return left, right, merged


def heading(text):
    return kind(text) in ('text', 'empty') or bool(re.match(r'^(19|20)\d\d$', text.strip()))


def is_text_only(line):
    return all(heading(w[4]) for w in line['words'])


def mostly_text(line):
    words = [w[4] for w in line['words']]
    return sum(heading(w) for w in words) * 2 >= len(words)


def numbered_heading(region):
    """A first line such as "Week 1 Week 2 Week 3" over rows of values."""
    if len(region) < 3 or is_text_only(region[0]) or not mostly_text(region[0]):
        return False
    return all(not mostly_text(line) for line in region[1:3])


def stream_table(region):
    has_values = any(not is_text_only(line) for line in region[1:])
    head = []
    if numbered_heading(region):
        head.append(region[0])
        region = region[1:]
    while region and is_text_only(region[0]) and len(head) < (3 if has_values else 1):
        if head and region[0]['top'] - head[-1]['bottom'] > head[-1]['height'] * 0.5:
            break
        head.append(region[0])
        region = region[1:]
    body = [line for line in region if line['chunks'] >= 2] or region
    if len(body) < 2:
        return None
    left, right, gaps = separators(body)
    bounds = [left - 1] + [(a + b) / 2 for a, b in gaps] + [right + 1]
    count = len(bounds) - 1

    def column(x):
        for i in range(count):
            if x < bounds[i + 1]:
                return i
        return count - 1

    rows, extents = [], [[] for _ in range(count)]
    for line in region:
        cells = [''] * count
        for w in line['words']:
            i = column(w[0])
            cells[i] = (cells[i] + ' ' + w[4]).strip()
            extents[i].append((w[0], w[2]))
        kinds = [kind(c) for c in cells]
        if rows and kinds[0] == 'empty' and not any(k in ('number', 'date') for k in kinds):
            for i, c in enumerate(cells):
                if c:
                    rows[-1][i] = (rows[-1][i] + ' ' + c).strip()
        else:
            rows.append(cells)

    def right_aligned(i):
        if not extents[i]:
            return False
        rights = [b for _, b in extents[i]]
        lefts = [a for a, _ in extents[i]]
        return max(rights) - min(rights) < max(lefts) - min(lefts)

    # Spreadsheets put headings at the left of a cell and numbers at the right.
    cells = [''] * count
    for line in head:
        for w in line['words']:
            i = column(w[0])
            if i + 1 < count and right_aligned(i + 1) and (
                not extents[i] or w[0] > max(b for _, b in extents[i])
            ):
                i += 1
            cells[i] = (cells[i] + ' ' + w[4]).strip()
    headers = [cells] if head else []
    top = (head or region)[0]['top']
    bottom = region[-1]['bottom']
    return {
        'rows': headers + rows,
        'header': len(headers) if rows else 0,
        'bbox': [left, top, right, bottom],
        'cores': [
            (min(a for a, _ in e), max(b for _, b in e)) if e else None
            for e in extents
        ],
    }


def looks_like_a_table(rows):
    cells = [c for row in rows for c in row if c]
    if len(rows) < 2 or len(rows[0]) < 2 or not cells:
        return False
    long = sum(len(c) > 60 for c in cells) / len(cells)
    filled = len(cells) / (len(rows) * len(rows[0]))
    return long < 0.15 and filled > 0.45


def header_rows(rows):
    """How many rows at the top are headings: text over rows with values."""
    def values(row):
        return any(not heading(c) for c in row if c)

    if not any(values(row) for row in rows[1:]):
        return 1
    count = 0
    for row in rows[:2]:
        if values(row) or not any(c for c in row if c):
            break
        count += 1
    return count


def sideways(page):
    words = page.get_text('words')
    tall = sum(1 for w in words if w[3] - w[1] > w[2] - w[0])
    return tall > len(words) / 2


def page_tables(page):
    if page.rotation and sideways(page):
        page.remove_rotation()
    found = ruled_tables(page) if has_lines(page) else []
    skip = [pymupdf.Rect(t['bbox']) for t in found]
    for region in regions(lines_of(page, skip)):
        table = stream_table(region)
        if table and looks_like_a_table(table['rows']):
            found.append(table)
    found.sort(key=lambda t: (t['bbox'][1], t['bbox'][0]))
    return found


def continues(before, after):
    """Whether `after`, at the top of the next page, carries on `before`."""
    if len(before['cores']) != len(after['cores']):
        return False
    for a, b in zip(before['cores'], after['cores']):
        if a and b and (a[0] > b[1] + 3 or b[0] > a[1] + 3):
            return False
    head = before['rows'][:before['header']]
    if after['header']:
        return after['rows'][:after['header']] == head
    return True


def tables(pdf_path):
    """The PDF's tables as JSON: {"tables": [{"pages", "rows", "header"}],
    "pages"}. Cells are text; None marks a cell covered by a merged one."""
    doc = pymupdf.open(pdf_path)
    if doc.needs_pass:
        raise ValueError('The PDF needs a password (encrypted)')
    try:
        if repair_text_map(doc):
            doc = pymupdf.open(stream=doc.tobytes())
    except Exception as error:
        logging.debug('Text map left as it was: %s', error)
    pages = []
    for page in doc:
        try:
            pages.append(page_tables(page))
        except Exception as error:
            logging.debug('Page %d skipped: %s', page.number + 1, error)
            pages.append([])
    joined = []
    last = None
    for number, found in enumerate(pages, start=1):
        for i, table in enumerate(found):
            table.setdefault('header', header_rows(table['rows']))
            if (
                i == 0 and last is not None and last['pages'][-1] == number - 1
                and last['last'] and continues(last, table)
            ):
                last['rows'] += table['rows'][table['header']:]
                last['pages'].append(number)
                last['last'] = len(found) == 1
                continue
            last = dict(table, pages=[number], last=i == len(found) - 1)
            joined.append(last)
    result = [
        {'pages': t['pages'], 'rows': t['rows'], 'header': t['header']}
        for t in joined
    ]
    count = len(doc)
    doc.close()
    return json.dumps({'tables': result, 'pages': count})
