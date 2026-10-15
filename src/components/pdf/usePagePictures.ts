import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useRef, useState } from 'react'
import { pagePicture } from '../../engines/pdf/pdfjs'

/** A page's thumbnail: a data URL, or null if it couldn't be drawn. */
export type Pictures = ReadonlyMap<number, string | null>

type Queue = {
  doc?: PDFDocumentProxy
  waiting: number[]
  asked: Set<number>
  busy: boolean
}

const NONE: Pictures = new Map()

/**
 * Page thumbnails, `size` pixels at most each way, drawn one at a time and
 * only for pages that are asked for (the ones scrolled near), so a long PDF
 * doesn't draw hundreds at once. Pages are numbered from 0.
 */
export function usePagePictures(
  doc: PDFDocumentProxy | undefined,
  size: number,
) {
  const [drawn, setDrawn] = useState<{
    doc?: PDFDocumentProxy
    pictures: Pictures
  }>({ pictures: NONE })
  const queue = useRef<Queue>({ waiting: [], asked: new Set(), busy: false })

  // Each PDF gets its own queue, so pictures of the last one never turn up.
  const queueFor = useCallback(() => {
    if (queue.current.doc !== doc) {
      queue.current = { doc, waiting: [], asked: new Set(), busy: false }
    }
    return queue.current
  }, [doc])

  const drawWaiting = useCallback(
    async (q: Queue) => {
      if (q.busy || !q.doc) return
      q.busy = true
      while (q.waiting.length && queue.current === q) {
        const index = q.waiting.shift()!
        let picture: string | null
        try {
          picture = await pagePicture(q.doc, index + 1, size, size)
        } catch (e) {
          // Expected if another PDF was chosen meanwhile, which closes this one.
          if (queue.current === q)
            console.warn(`Couldn’t draw page ${index + 1}:`, e)
          picture = null
        }
        if (queue.current !== q) break
        setDrawn((current) => {
          const pictures = new Map(
            current.doc === q.doc ? current.pictures : [],
          )
          pictures.set(index, picture)
          return { doc: q.doc, pictures }
        })
      }
      q.busy = false
    },
    [size],
  )

  /** Asks for a page's picture, e.g. as it scrolls into view. */
  const want = useCallback(
    (index: number) => {
      const q = queueFor()
      if (!q.doc || q.asked.has(index)) return
      q.asked.add(index)
      q.waiting.push(index)
      void drawWaiting(q)
    },
    [queueFor, drawWaiting],
  )

  /** Drops a page that's no longer wanted, e.g. it scrolled past, if it's still waiting. */
  const unwant = useCallback(
    (index: number) => {
      const q = queueFor()
      const at = q.waiting.indexOf(index)
      if (at < 0) return
      q.waiting.splice(at, 1)
      q.asked.delete(index)
    },
    [queueFor],
  )

  const pictures = drawn.doc === doc ? drawn.pictures : NONE
  return { pictures, want, unwant }
}
