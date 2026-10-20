# Compress PDF: Tuls's own step, run in Pyodide with PyMuPDF only (the
# light start in worker.ts). Images are made smaller; everything else is
# kept: text stays text, and links, bookmarks and form fields stay.
#
# MuPDF 1.26.3's image rewriter writes broken JPEGs for images that aren't
# RGB: grey scans come out smeared, CMYK photos grey and striped (CLAUDE.md,
# "Compress PDF: findings"). So JPEGs are re-encoded here, with
# Pixmap.tobytes, which writes them correctly, and MuPDF's rewriter only
# shrinks lossless images, keeping them lossless. Black-and-white images
# keep their resolution, with fax compression (lossless).
#
# Left out on purpose: font subsetting (Apple's readers then read some
# symbols' text differently, for 4% at most) and content cleaning (saves
# nothing, and rewrites every page).
import json

import pymupdf
from pymupdf import mupdf

LEVELS = {
    # Looks the same on screen and prints well.
    'recommended': dict(threshold=200, target=150, quality=80),
    # Fine on screen; photos print softer.
    'smallest': dict(threshold=120, target=96, quality=60),
}

# A re-encoded image is kept only if it's at least this much smaller.
IMAGE_SAVING = 0.95


def lossless_options(level):
    """MuPDF's rewriter, for lossless and black-and-white images only."""
    options = mupdf.PdfImageRewriterOptions()

    def kind(name, recompress, threshold, target):
        setattr(options, name + '_image_recompress_method', recompress)
        setattr(options, name + '_image_subsample_method', mupdf.FZ_SUBSAMPLE_BICUBIC)
        setattr(options, name + '_image_subsample_threshold', threshold)
        setattr(options, name + '_image_subsample_to', target)
        setattr(options, name + '_image_recompress_quality', '')

    for name in ('color_lossy', 'gray_lossy'):
        kind(name, mupdf.FZ_RECOMPRESS_NEVER, 0, 0)
    for name in ('color_lossless', 'gray_lossless'):
        kind(name, mupdf.FZ_RECOMPRESS_LOSSLESS, level['threshold'], level['target'])
    kind('bitonal', mupdf.FZ_RECOMPRESS_FAX, 0, 0)
    return options


def placed_widths(doc):
    """Each image's biggest width on any page, in points: where it's shown
    largest, it needs the most pixels."""
    widths = {}
    for page in doc:
        for info in page.get_images(full=True):
            xref = info[0]
            for rect in page.get_image_rects(xref):
                widths[xref] = max(widths.get(xref, 0), rect.width)
    return widths


def is_jpeg(doc, xref):
    return doc.xref_get_key(xref, 'Filter')[1] in ('/DCTDecode', '[/DCTDecode]')


def smaller_jpegs(doc, level):
    """Re-encodes the JPEGs, shrinking those sharper than the level needs.
    Grey stays grey; CMYK and others become RGB. The new data goes into the
    same object, so a transparency mask (/SMask) stays with it."""
    changed = 0
    for xref, shown in placed_widths(doc).items():
        if shown <= 0 or not is_jpeg(doc, xref):
            continue
        before = len(doc.xref_stream_raw(xref))
        pix = pymupdf.Pixmap(doc, xref)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n not in (1, 3):
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        dpi = pix.width / (shown / 72)
        if dpi > level['threshold']:
            scale = level['target'] / dpi
            pix = pymupdf.Pixmap(
                pix,
                max(1, round(pix.width * scale)),
                max(1, round(pix.height * scale)),
                None,
            )
        data = pix.tobytes('jpeg', jpg_quality=level['quality'])
        if len(data) >= before * IMAGE_SAVING:
            continue
        doc.update_stream(xref, data, compress=False)
        doc.xref_set_key(xref, 'Filter', '/DCTDecode')
        doc.xref_set_key(xref, 'Width', str(pix.width))
        doc.xref_set_key(xref, 'Height', str(pix.height))
        doc.xref_set_key(xref, 'BitsPerComponent', '8')
        doc.xref_set_key(xref, 'ColorSpace', '/DeviceGray' if pix.n == 1 else '/DeviceRGB')
        for key in ('DecodeParms', 'Decode', 'Length1'):
            doc.xref_set_key(xref, key, 'null')
        changed += 1
    return changed


def compress(src, dst, level_name):
    """Writes a smaller copy of the PDF at src to dst. Returns JSON: how many
    JPEGs were made smaller. A PDF that needs a password raises."""
    level = LEVELS[level_name]
    doc = pymupdf.open(src)
    # Locked only against changes opens without a password, and comes out
    # unlocked, as in the other PDF tools.
    if doc.needs_pass:
        raise ValueError('The PDF needs a password (encrypted)')
    images = smaller_jpegs(doc, level)
    doc.rewrite_images(options=lossless_options(level))
    doc.set_metadata({})
    doc.del_xml_metadata()
    doc.save(
        dst,
        garbage=4,
        deflate=True,
        deflate_images=True,
        deflate_fonts=True,
        use_objstms=1,
        encryption=pymupdf.PDF_ENCRYPT_NONE,
    )
    doc.close()
    return json.dumps({'images': images})
