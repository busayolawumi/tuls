import { beforeAll, describe, expect, it } from 'vitest'
import { loadPython, PYMUPDF_ONLY, type Python } from './python.node-testing'

// tuls_compress.py, run in the light engine's own Python (Pyodide and
// PyMuPDF only: what the browser loads for Compress PDF), on PDFs made here
// with PyMuPDF. Each kind of image MuPDF's own rewriter got wrong has a test
// (CLAUDE.md, "Compress PDF: findings").

let python: Python
const run = (code: string) => JSON.parse(String(python.runPython(code)))

beforeAll(async () => {
  python = await loadPython(PYMUPDF_ONLY, ['tuls_compress.py'])
  // Helpers for the tests: a photo-like picture, how a page looks, and what
  // the PDF's first image is like.
  python.runPython(`
import json, math, os

def photo(w, h, n=3):
    """Smooth colour with detail, like a photo, as a Pixmap."""
    data = bytearray()
    for y in range(h):
        for x in range(w):
            v = (math.sin(x / 7) + math.cos(y / 5) + 2) * 60
            if n == 1:
                data.append(int(v) % 256)
            else:
                data += bytes([int(v) % 256, int(x * 255 / w), int(y * 255 / h)])
    cs = pymupdf.csGRAY if n == 1 else pymupdf.csRGB
    return pymupdf.Pixmap(cs, w, h, bytes(data), False)

def look(path):
    return pymupdf.open(path)[0].get_pixmap(dpi=72, alpha=False)

def difference(a, b):
    sa, sb = look(a).samples, look(b).samples
    return sum(abs(p - q) for p, q in zip(sa, sb)) / len(sa)

def first_image(path):
    doc = pymupdf.open(path)
    xref, smask, w, h = doc[0].get_images(full=True)[0][:4]
    return dict(width=w, height=h, smask=smask,
        filter=doc.xref_get_key(xref, 'Filter')[1],
        colorspace=doc.xref_get_key(xref, 'ColorSpace')[1],
        components=pymupdf.Pixmap(doc, xref).n)

def one_image_pdf(path, stream=None, pixmap=None, mask=None, inches=2):
    """A page with one image, shown \`inches\` wide."""
    doc = pymupdf.open()
    page = doc.new_page(width=300, height=300)
    page.draw_rect(page.rect, color=None, fill=(0.95, 0.85, 0.2))
    rect = pymupdf.Rect(10, 10, 10 + 72 * inches, 10 + 72 * inches)
    page.insert_image(rect, stream=stream, pixmap=pixmap, mask=mask)
    doc.save(path)

def compressed(level='recommended'):
    result = json.loads(compress('/in.pdf', '/out.pdf', level))
    return dict(result, before=os.path.getsize('/in.pdf'), after=os.path.getsize('/out.pdf'),
        difference=difference('/in.pdf', '/out.pdf'), image=first_image('/out.pdf'))
`)
}, 60_000)

describe('JPEG photos', () => {
  it('are shrunk to 150 dpi (recommended) or 96 (smallest), and look the same', () => {
    // 600 pixels shown 2 inches wide: 300 dpi.
    python.runPython(
      `one_image_pdf('/in.pdf', stream=photo(600, 600).tobytes('jpeg', jpg_quality=95))`,
    )
    const recommended = run(`json.dumps(compressed('recommended'))`)
    expect(recommended.image.width).toBe(300)
    expect(recommended.after).toBeLessThan(recommended.before / 2)
    expect(recommended.difference).toBeLessThan(3)
    const smallest = run(`json.dumps(compressed('smallest'))`)
    expect(smallest.image.width).toBe(192)
    expect(smallest.difference).toBeLessThan(4)
  })

  it('keeps grey JPEGs grey and readable (MuPDF garbled them)', () => {
    python.runPython(
      `one_image_pdf('/in.pdf', stream=photo(600, 600, 1).tobytes('jpeg', jpg_quality=95))`,
    )
    const result = run(`json.dumps(compressed())`)
    expect(result.image).toMatchObject({
      width: 300,
      filter: '/DCTDecode',
      colorspace: '/DeviceGray',
    })
    expect(result.difference).toBeLessThan(3)
  })

  it('turns CMYK JPEGs into RGB, with the same colours (MuPDF striped them)', () => {
    python.runPython(`
cmyk = pymupdf.Pixmap(pymupdf.csCMYK, photo(600, 600))
one_image_pdf('/in.pdf', pixmap=cmyk)
# Stored as a CMYK JPEG, as print PDFs have them.
doc = pymupdf.open('/in.pdf')
xref = doc[0].get_images()[0][0]
doc.update_stream(xref, cmyk.tobytes('jpeg', jpg_quality=95), compress=False)
doc.xref_set_key(xref, 'Filter', '/DCTDecode')
doc.xref_set_key(xref, 'DecodeParms', 'null')
doc.save('/cmyk.pdf')
os.replace('/cmyk.pdf', '/in.pdf')
`)
    expect(run(`json.dumps(first_image('/in.pdf'))`).components).toBe(4)
    const result = run(`json.dumps(compressed())`)
    expect(result.image.colorspace).toBe('/DeviceRGB')
    expect(result.difference).toBeLessThan(4)
  })

  it('keeps their transparency mask', () => {
    python.runPython(`
w = h = 600
mask = pymupdf.Pixmap(pymupdf.csGRAY, w, h, bytes(
    max(0, min(255, int(255 * (1.2 - math.hypot(x / w * 2 - 1, y / h * 2 - 1)) / 0.4)))
    for y in range(h) for x in range(w)), False)
one_image_pdf('/in.pdf', stream=photo(w, h).tobytes('jpeg', jpg_quality=95), mask=mask.tobytes('png'))
`)
    const result = run(`json.dumps(compressed())`)
    expect(result.image.smask).toBeGreaterThan(0)
    expect(result.image.width).toBe(300)
    // The yellow page still shows through the edges.
    expect(result.difference).toBeLessThan(3)
  })

  it('aren’t touched when it wouldn’t make them smaller', () => {
    // Already small: 150 pixels shown 2 inches wide, at quality 50.
    python.runPython(
      `one_image_pdf('/in.pdf', stream=photo(150, 150).tobytes('jpeg', jpg_quality=50))`,
    )
    const result = run(`json.dumps(compressed())`)
    expect(result.images).toBe(0)
    expect(result.image.width).toBe(150)
  })
})

describe('other images', () => {
  it('keeps lossless images lossless, shrunk', () => {
    python.runPython(`one_image_pdf('/in.pdf', pixmap=photo(600, 600))`)
    const result = run(`json.dumps(compressed())`)
    expect(result.image.filter).toBe('/FlateDecode')
    expect(result.image.width).toBeLessThan(600)
    expect(result.difference).toBeLessThan(3)
  })

  it('leaves black-and-white images at full resolution', () => {
    python.runPython(`
w = h = 600
bw = pymupdf.Pixmap(pymupdf.csGRAY, w, h, bytes(255 if (x // 20 + y // 20) % 2 else 0 for y in range(h) for x in range(w)), False)
one_image_pdf('/in.pdf', stream=bw.tobytes('png'))
`)
    const result = run(`json.dumps(compressed('smallest'))`)
    expect(result.image.width).toBe(600)
    expect(result.difference).toBeLessThan(1)
  })
})

describe('the rest of the PDF', () => {
  it('keeps text, links, bookmarks and form fields, and removes its details', () => {
    const facts = run(`
doc = pymupdf.open()
page = doc.new_page()
page.insert_text((72, 72), 'Statement of account', fontsize=14)
widget = pymupdf.Widget()
widget.field_name = 'name'
widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
widget.field_value = 'Ada Example'
widget.rect = pymupdf.Rect(72, 150, 300, 170)
page.add_widget(widget)
# After the field: added before it, the link was lost.
page.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(72, 100, 200, 120), 'uri': 'https://example.com/statement'})
doc.set_toc([[1, 'Step 1) Start', 1]])
doc.set_metadata(dict(author='Ada Example', title='Salary review'))
doc.set_xml_metadata('<x:xmpmeta xmlns:x="adobe:ns:meta/">Ada Example</x:xmpmeta>')
doc.save('/in.pdf')
assert len(pymupdf.open('/in.pdf')[0].get_links()) == 1
compress('/in.pdf', '/out.pdf', 'smallest')
out = pymupdf.open('/out.pdf')
json.dumps(dict(
    text=' '.join(out[0].get_text().split()),
    links=[l.get('uri') for l in out[0].get_links()],
    toc=out.get_toc(),
    fields={w.field_name: w.field_value for w in out[0].widgets()},
    metadata={k: v for k, v in out.metadata.items() if v and k in ('author', 'title', 'subject', 'keywords')},
    xmp=out.get_xml_metadata(),
))
`)
    expect(facts.text).toContain('Statement of account')
    expect(facts.links).toEqual(['https://example.com/statement'])
    expect(facts.toc).toEqual([[1, 'Step 1) Start', 1]])
    expect(facts.fields).toEqual({ name: 'Ada Example' })
    expect(facts.metadata).toEqual({})
    expect(facts.xmp).toBe('')
  })

  it('unlocks a PDF locked only against changes, and refuses one with a password', () => {
    const results = run(`
doc = pymupdf.open()
doc.new_page().insert_text((72, 72), 'Locked')
doc.save('/owner.pdf', encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw='bank', user_pw='', permissions=pymupdf.PDF_PERM_PRINT)
doc.save('/user.pdf', encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw='bank', user_pw='secret')
compress('/owner.pdf', '/out.pdf', 'recommended')
try:
    compress('/user.pdf', '/out2.pdf', 'recommended')
    refused = ''
except Exception as e:
    refused = str(e)
json.dumps(dict(encrypted=pymupdf.open('/out.pdf').is_encrypted, refused=refused))
`)
    expect(results.encrypted).toBe(false)
    expect(results.refused).toMatch(/password/)
  })
})
