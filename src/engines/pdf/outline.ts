import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFRef,
  PDFString,
  type PDFDocument,
  type PDFObject,
} from '@cantoo/pdf-lib'

/** A bookmark, with its page as an index into its PDF's pages. */
export type Bookmark = {
  title: string
  target?: Target
  open: boolean
  colour?: number[]
  style?: number
  children: Bookmark[]
}

/** A place in a PDF: a page (from 0), and how to show it. */
export type PageTarget = { page: number; fit: string; args: (number | null)[] }

type Target = PageTarget | { uri: string }

const FITS = new Set([
  'XYZ',
  'Fit',
  'FitH',
  'FitV',
  'FitR',
  'FitB',
  'FitBH',
  'FitBV',
])
const MOST = 20_000
const DEEPEST = 64

const name = (key: string) => PDFName.of(key)

/** Bytes as a string, one character per byte, for comparing names. */
function byteString(value: PDFObject | undefined) {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return String.fromCharCode(...value.asBytes())
  }
  if (value instanceof PDFName) return value.decodeText()
  return undefined
}

function textOf(value: PDFObject | undefined) {
  if (value instanceof PDFString || value instanceof PDFHexString) {
    return value.decodeText()
  }
  return ''
}

/** Named destinations, from the catalog's /Dests and its /Names tree. */
function namedDestinations(doc: PDFDocument) {
  const found = new Map<string, PDFObject>()
  const { context, catalog } = doc
  const old = catalog.lookupMaybe(name('Dests'), PDFDict)
  for (const [key, value] of old?.entries() ?? []) {
    found.set(key.decodeText(), value)
  }
  const tree = catalog
    .lookupMaybe(name('Names'), PDFDict)
    ?.lookupMaybe(name('Dests'), PDFDict)
  const seen = new Set<PDFObject>()
  const walk = (node: PDFDict | undefined, depth: number) => {
    if (!node || seen.has(node) || depth > DEEPEST) return
    seen.add(node)
    const names = node.lookupMaybe(name('Names'), PDFArray)
    for (let i = 0; names && i + 1 < names.size(); i += 2) {
      const key = byteString(context.lookup(names.get(i)))
      if (key !== undefined) found.set(key, names.get(i + 1))
    }
    const kids = node.lookupMaybe(name('Kids'), PDFArray)
    for (let i = 0; kids && i < kids.size(); i++) {
      walk(context.lookupMaybe(kids.get(i), PDFDict), depth + 1)
    }
  }
  walk(tree, 0)
  return found
}

/**
 * Works out where a destination goes: an explicit one, or one named in the
 * catalog. Undefined when it isn't a page of this PDF.
 */
export function destinationReader(doc: PDFDocument) {
  const { context } = doc
  const pages = new Map(
    doc.getPages().map((page, i) => [page.ref.toString(), i]),
  )
  let named: Map<string, PDFObject> | undefined
  return (value: PDFObject | undefined): PageTarget | undefined => {
    let dest = value instanceof PDFRef ? context.lookup(value) : value
    if (
      dest instanceof PDFName ||
      dest instanceof PDFString ||
      dest instanceof PDFHexString
    ) {
      named ??= namedDestinations(doc)
      const key = byteString(dest)
      dest = key === undefined ? undefined : named.get(key)
      if (dest instanceof PDFRef) dest = context.lookup(dest)
    }
    if (dest instanceof PDFDict) dest = dest.lookup(name('D'))
    if (!(dest instanceof PDFArray) || dest.size() === 0) return undefined
    const first = dest.get(0)
    const page =
      first instanceof PDFRef
        ? pages.get(first.toString())
        : first instanceof PDFNumber && pages.size > first.asNumber()
          ? first.asNumber()
          : undefined
    if (page === undefined) return undefined
    const fit = dest.lookup(1)
    const fitName = fit instanceof PDFName ? fit.decodeText() : ''
    if (!FITS.has(fitName)) return { page, fit: 'Fit', args: [] }
    const args: (number | null)[] = []
    for (let i = 2; i < dest.size(); i++) {
      const arg = dest.lookup(i)
      args.push(arg instanceof PDFNumber ? arg.asNumber() : null)
    }
    return { page, fit: fitName, args }
  }
}

/** An explicit destination array for a page of `doc`. */
export function destinationArray(doc: PDFDocument, target: PageTarget) {
  return doc.context.obj([
    doc.getPage(target.page).ref,
    name(target.fit),
    ...target.args.map((arg) => (arg === null ? PDFNull : PDFNumber.of(arg))),
  ])
}

/**
 * Reads a PDF's bookmarks (its outline). Bookmarks that go to a page or a
 * web address are kept; ones that run other actions keep only their title,
 * and are dropped if nothing under them is kept.
 */
export function readOutline(doc: PDFDocument): Bookmark[] {
  const { context, catalog } = doc
  const root = catalog.lookupMaybe(name('Outlines'), PDFDict)
  if (!root) return []
  const explicit = destinationReader(doc)
  const seen = new Set<PDFObject>()
  let count = 0

  const targetOf = (item: PDFDict): Target | undefined => {
    const dest = item.get(name('Dest'))
    if (dest) return explicit(dest)
    const action = item.lookupMaybe(name('A'), PDFDict)
    const kind = action?.lookup(name('S'))
    if (!action || !(kind instanceof PDFName)) return undefined
    if (kind.decodeText() === 'GoTo') return explicit(action.get(name('D')))
    if (kind.decodeText() === 'URI') {
      const uri = byteString(action.lookup(name('URI')))
      return uri ? { uri } : undefined
    }
    return undefined
  }

  const level = (first: PDFObject | undefined, depth: number): Bookmark[] => {
    const items: Bookmark[] = []
    let next = first
    while (next && count < MOST && depth < DEEPEST) {
      const item = context.lookup(next)
      if (!(item instanceof PDFDict) || seen.has(item)) break
      seen.add(item)
      count++
      const colour = item.lookupMaybe(name('C'), PDFArray)
      const style = item.lookupMaybe(name('F'), PDFNumber)
      const itemCount = item.lookupMaybe(name('Count'), PDFNumber)
      items.push({
        title: textOf(item.lookup(name('Title'))),
        target: targetOf(item),
        open: (itemCount?.asNumber() ?? 0) > 0,
        colour:
          colour?.size() === 3
            ? colour
                .asArray()
                .map((part) =>
                  part instanceof PDFNumber ? part.asNumber() : 0,
                )
            : undefined,
        style: style?.asNumber(),
        children: level(item.get(name('First')), depth + 1),
      })
      next = item.get(name('Next'))
    }
    return items
  }

  try {
    return level(root.get(name('First')), 0)
  } catch (e) {
    console.warn('Couldn’t read the bookmarks:', e)
    return []
  }
}

/** The first target in a list of bookmarks, depth first. */
function firstTarget(items: Bookmark[]): Target | undefined {
  for (const item of items) {
    const target = item.target ?? firstTarget(item.children)
    if (target) return target
  }
  return undefined
}

/**
 * Moves bookmarks to new page numbers. `move` gives a page's new index, or
 * undefined if the page isn't kept. A bookmark whose page is gone is dropped,
 * unless bookmarks under it are kept: then it goes to the first of those.
 */
export function moveOutline(
  items: Bookmark[],
  move: (page: number) => number | undefined,
): Bookmark[] {
  const moved: Bookmark[] = []
  for (const item of items) {
    const children = moveOutline(item.children, move)
    let target: Target | undefined = item.target
    if (target && 'page' in target) {
      const page = move(target.page)
      target = page === undefined ? undefined : { ...target, page }
    }
    if (!target && item.target) target = firstTarget(children)
    if (!target && children.length === 0) continue
    moved.push({ ...item, target, children })
  }
  return moved
}

/** Writes bookmarks into a PDF, replacing any it has. */
export function writeOutline(doc: PDFDocument, items: Bookmark[]) {
  const { context, catalog } = doc
  if (items.length === 0) return
  const pages = doc.getPages()

  // Writes one level under `parent`. `shown` is how many show when the
  // parent is open, counting open bookmarks' children.
  const level = (list: Bookmark[], parent: PDFRef) => {
    const refs = list.map(() => context.nextRef())
    let shown = 0
    list.forEach((item, i) => {
      const dict = context.obj({}) as PDFDict
      dict.set(name('Title'), PDFHexString.fromText(item.title))
      dict.set(name('Parent'), parent)
      if (i > 0) dict.set(name('Prev'), refs[i - 1])
      if (i < list.length - 1) dict.set(name('Next'), refs[i + 1])
      const { target } = item
      if (target && 'page' in target && pages[target.page]) {
        dict.set(name('Dest'), destinationArray(doc, target))
      } else if (target && 'uri' in target) {
        const action = context.obj({}) as PDFDict
        action.set(name('S'), name('URI'))
        action.set(name('URI'), PDFString.of(escapeLiteral(target.uri)))
        dict.set(name('A'), action)
      }
      if (item.colour) dict.set(name('C'), context.obj(item.colour))
      if (item.style) dict.set(name('F'), PDFNumber.of(item.style))
      let under = 0
      if (item.children.length > 0) {
        const children = level(item.children, refs[i])
        under = children.shown
        dict.set(name('First'), children.refs[0])
        dict.set(name('Last'), children.refs[children.refs.length - 1])
        dict.set(name('Count'), PDFNumber.of(item.open ? under : -under))
      }
      context.assign(refs[i], dict)
      shown += 1 + (item.open ? under : 0)
    })
    return { refs, shown }
  }

  const rootRef = context.nextRef()
  const top = level(items, rootRef)
  const root = context.obj({}) as PDFDict
  root.set(name('Type'), name('Outlines'))
  root.set(name('First'), top.refs[0])
  root.set(name('Last'), top.refs[top.refs.length - 1])
  root.set(name('Count'), PDFNumber.of(top.shown))
  context.assign(rootRef, root)
  catalog.set(name('Outlines'), rootRef)
}

/** A string as a PDF literal's source text: PDFString.of doesn't escape. */
function escapeLiteral(value: string) {
  return value.replace(/[\\()]/g, (c) => `\\${c}`)
}

/**
 * Whether a PDF asks viewers to open with its bookmarks showing, so a new
 * PDF made from it can ask the same.
 */
export function opensWithOutline(doc: PDFDocument) {
  const mode = doc.catalog.lookup(name('PageMode'))
  return mode instanceof PDFName && mode.decodeText() === 'UseOutlines'
}

/** Writes the bookmarks, and asks viewers to show them if a source did. */
export function keepOutline(
  doc: PDFDocument,
  items: Bookmark[],
  show: boolean,
) {
  try {
    writeOutline(doc, items)
    if (show && items.length > 0) {
      doc.catalog.set(name('PageMode'), name('UseOutlines'))
    }
  } catch (e) {
    console.warn('Couldn’t write the bookmarks:', e)
    doc.catalog.delete(name('Outlines'))
  }
}
