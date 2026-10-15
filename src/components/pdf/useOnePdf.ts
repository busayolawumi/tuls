import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useState } from 'react'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import { closePdf, openPdf } from '../../engines/pdf/pdfjs'

export type OpenedPdf = { file: File; doc: PDFDocumentProxy }

/**
 * Opening the one PDF a tool works on, with pdf.js: whether it's opening,
 * why it couldn't be, and closing it again when it's done with (another one
 * is chosen, or the tool closes). PDFs with more than `maxPages` pages are
 * turned down, in a message that names `toolName`.
 */
export function useOnePdf(maxPages: number, toolName: string) {
  const [opened, setOpened] = useState<OpenedPdf>()
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string>()

  // pdf.js keeps an open PDF in memory until it's closed.
  useEffect(() => {
    const doc = opened?.doc
    return () => {
      if (doc) void closePdf(doc)
    }
  }, [opened])

  /** Opens `file`, returning it once open, or undefined if it couldn't be. */
  const open = useCallback(
    async (file: File) => {
      setOpening(true)
      setError(undefined)
      try {
        const doc = await openPdf(await file.arrayBuffer())
        if (doc.numPages > maxPages) {
          void closePdf(doc)
          setError(
            `This PDF has ${doc.numPages.toLocaleString()} pages. ${toolName} works with up to ${maxPages.toLocaleString()}.`,
          )
          return
        }
        const pdf = { file, doc }
        setOpened(pdf)
        return pdf
      } catch (e) {
        console.warn(`Couldn't open ${file.name}:`, e)
        setError(PDF_ERROR_MESSAGES[pdfErrorKind(e)])
      } finally {
        setOpening(false)
      }
    },
    [maxPages, toolName],
  )

  /** Lets the PDF go, e.g. to choose another. */
  const close = useCallback(() => setOpened(undefined), [])

  return { opened, opening, error, open, close }
}
