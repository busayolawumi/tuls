// Just enough XML for editing parts of a Word file in place: find elements
// and read attributes, leaving everything else byte for byte as it was.

/** An element, with where it sits in the text it was found in. */
export type Element = {
  name: string
  /** The opening tag, e.g. `<w:tab w:val="left" w:pos="720"/>`. */
  tag: string
  /** What's between the opening and closing tags ('' if self-closing). */
  inner: string
  start: number
  end: number
}

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

/** The elements directly inside `xml` (not their children), in order. */
export function children(xml: string): Element[] {
  const found: Element[] = []
  let depth = 0
  let open: { name: string; tag: string; start: number; innerStart: number }
  open = { name: '', tag: '', start: 0, innerStart: 0 }
  TAG.lastIndex = 0
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    const [whole, closing, name, , selfClosing] = m
    if (closing) {
      depth--
      if (depth === 0) {
        found.push({
          name: open.name,
          tag: open.tag,
          inner: xml.slice(open.innerStart, m.index),
          start: open.start,
          end: m.index + whole.length,
        })
      }
    } else if (selfClosing) {
      if (depth === 0) {
        found.push({
          name,
          tag: whole,
          inner: '',
          start: m.index,
          end: m.index + whole.length,
        })
      }
    } else {
      if (depth === 0) {
        open = {
          name,
          tag: whole,
          start: m.index,
          innerStart: m.index + whole.length,
        }
      }
      depth++
    }
  }
  return found
}

/** The first direct child called `name`. */
export function child(xml: string, name: string) {
  return children(xml).find((element) => element.name === name)
}

/** An attribute's value, e.g. attr('<w:sz w:val="22"/>', 'w:val') is "22". */
export function attr(tag: string, name: string) {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)
  return match?.[1]
}

/** Whether an on/off property such as <w:b/> or <w:b w:val="0"/> is on. */
export function isOn(tag: string) {
  const value = attr(tag, 'w:val')
  return value === undefined || !['0', 'false', 'off', 'none'].includes(value)
}

/** XML text, with its entities decoded. */
export function decodeText(text: string) {
  return text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi, (_, e) => {
    const lower = e.toLowerCase()
    if (lower === 'lt') return '<'
    if (lower === 'gt') return '>'
    if (lower === 'amp') return '&'
    if (lower === 'quot') return '"'
    if (lower === 'apos') return "'"
    return String.fromCodePoint(
      lower.startsWith('#x')
        ? parseInt(lower.slice(2), 16)
        : Number(e.slice(1)),
    )
  })
}

/** Text for XML, with the characters that need it escaped. */
export function encodeText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
