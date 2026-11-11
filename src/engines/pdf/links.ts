import {
  PDFDict,
  PDFName,
  type PDFDocument,
  type PDFPage,
} from '@cantoo/pdf-lib'
import { destinationArray, destinationReader, type PageTarget } from './outline'

/**
 * Where each page's links within the PDF go, by page and by the link's place
 * in the page's annotations. Null: a link to somewhere not in this PDF.
 */
export type PageLinks = Map<number, Map<number, PageTarget | null>>

const name = (key: string) => PDFName.of(key)

/**
 * Takes the destinations off a PDF's links to its own pages, before the
 * pages are copied. Left on, pdf-lib copies each target page along with the
 * link, as a page outside the new PDF: the link goes nowhere and the file
 * grows. Returns where each link went, for `attachLinks`.
 */
export function detachLinks(doc: PDFDocument): PageLinks {
  const found: PageLinks = new Map()
  try {
    const read = destinationReader(doc)
    doc.getPages().forEach((page, index) => {
      const annots = page.node.Annots()
      for (let i = 0; i < (annots?.size() ?? 0); i++) {
        const annot = doc.context.lookupMaybe(annots!.get(i), PDFDict)
        if (annot?.get(name('Subtype')) !== name('Link')) continue
        let target: PageTarget | undefined
        if (annot.has(name('Dest'))) {
          target = read(annot.get(name('Dest')))
          annot.delete(name('Dest'))
        } else {
          const action = annot.lookupMaybe(name('A'), PDFDict)
          if (action?.lookup(name('S')) !== name('GoTo')) continue
          target = read(action.get(name('D')))
          annot.delete(name('A'))
        }
        if (!found.has(index)) found.set(index, new Map())
        found.get(index)!.set(i, target ?? null)
      }
    })
  } catch (e) {
    console.warn('Couldn’t read the links:', e)
  }
  return found
}

/**
 * Points copied links at their pages in the new PDF. `placed` pairs each
 * copied page with its original's index, and `move` gives a target page's
 * new index. Links to pages that aren't in the new PDF are removed.
 */
export function attachLinks(
  doc: PDFDocument,
  links: PageLinks,
  placed: [number, PDFPage][],
  move: (page: number) => number | undefined,
) {
  for (const [source, page] of placed) {
    try {
      const targets = links.get(source)
      const annots = page.node.Annots()
      if (!targets || !annots) continue
      const kept = []
      for (let i = 0; i < annots.size(); i++) {
        const entry = annots.get(i)
        if (!targets.has(i)) {
          kept.push(entry)
          continue
        }
        const target = targets.get(i)
        const to = target ? move(target.page) : undefined
        const annot = doc.context.lookupMaybe(entry, PDFDict)
        if (!target || to === undefined || !annot) continue
        annot.set(name('Dest'), destinationArray(doc, { ...target, page: to }))
        kept.push(entry)
      }
      page.node.set(name('Annots'), doc.context.obj(kept))
    } catch (e) {
      console.warn('Couldn’t place the links:', e)
    }
  }
}
