import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useState } from 'react'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { organisePdfInBackground } from '../../engines/pdf/client'
import {
  PDF_ERROR_MESSAGES,
  pdfErrorKind,
  type PdfErrorKind,
} from '../../engines/pdf/errors'
import {
  ACCEPT,
  MAX_FILE_SIZE,
  checkPdf,
  outputName,
  pagesLabel,
} from '../../engines/pdf/files'
import { closePdf, openPdf } from '../../engines/pdf/pdfjs'
import { formatSize } from '../../lib/format'
import { useTitle } from '../../lib/useTitle'
import {
  MAX_PAGES,
  keptLabel,
  movePage,
  planFor,
  startingPages,
  toggleDeleted,
  turnAll,
  turnPage,
  type Page,
} from './lib/pages'
import { manifest } from './manifest'
import { PageGrid } from './PageGrid'
import { usePagePictures } from './usePagePictures'

// Thumbnails fit a box about 150px square; drawn at twice that for sharp
// screens.
const PICTURE_SIZE = 300

type Opened = { file: File; doc: PDFDocumentProxy }
type Saved = { blob: Blob; url: string; name: string; pages: number }

const SAVE_ERRORS: Record<PdfErrorKind, string> = {
  password: PDF_ERROR_MESSAGES.password,
  unreadable: 'This PDF couldn’t be read, so it couldn’t be saved.',
  memory:
    'Your device ran out of memory saving this PDF. Try a computer, or a smaller PDF.',
  unknown: 'Something went wrong saving this PDF. Try again.',
}

function OrganisePdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [opened, setOpened] = useState<Opened>()
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState<string>()
  const [pages, setPages] = useState<Page[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<PdfErrorKind>()
  const [saved, setSaved] = useState<Saved>()
  // Read out by screen readers after turning or deleting a page.
  const [announcement, setAnnouncement] = useState('')
  const { pictures, want, unwant } = usePagePictures(opened?.doc, PICTURE_SIZE)

  // pdf.js keeps the open PDF in memory until it's closed.
  useEffect(() => {
    const doc = opened?.doc
    return () => {
      if (doc) void closePdf(doc)
    }
  }, [opened])

  const handleFiles = useCallback(async ([file]: File[]) => {
    setOpening(true)
    setOpenError(undefined)
    try {
      const doc = await openPdf(await file.arrayBuffer())
      if (doc.numPages > MAX_PAGES) {
        void closePdf(doc)
        setOpenError(
          `This PDF has ${doc.numPages.toLocaleString()} pages. Organise PDF works with up to ${MAX_PAGES}.`,
        )
        return
      }
      setOpened({ file, doc })
      setPages(startingPages(doc.numPages))
      setSaveError(undefined)
    } catch (e) {
      console.warn(`Couldn't open ${file.name}:`, e)
      setOpenError(PDF_ERROR_MESSAGES[pdfErrorKind(e)])
    } finally {
      setOpening(false)
    }
  }, [])

  const handleMove = useCallback((id: string, to: string) => {
    setPages((current) => movePage(current, id, to))
  }, [])

  const handleTurn = useCallback((page: Page) => {
    setPages((current) => turnPage(current, page.id))
    setAnnouncement(
      `Page ${page.index + 1} turned to ${(page.turn + 90) % 360}°.`,
    )
  }, [])

  const handleToggleDeleted = useCallback((page: Page) => {
    setPages((current) => toggleDeleted(current, page.id))
    setAnnouncement(
      `Page ${page.index + 1} will be ${page.deleted ? 'kept' : 'deleted'}.`,
    )
  }, [])

  function handleTurnAll() {
    setPages(turnAll)
    setAnnouncement('Every page turned a quarter clockwise.')
  }

  const plan = planFor(pages)

  async function handleSave() {
    if (!opened || plan.length === 0 || saving) return
    setSaving(true)
    setSaveError(undefined)
    try {
      const bytes = await organisePdfInBackground(
        await opened.file.arrayBuffer(),
        plan,
      )
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: 'application/pdf',
      })
      setSaved({
        blob,
        url: URL.createObjectURL(blob),
        name: outputName(opened.file.name, 'organised'),
        pages: plan.length,
      })
    } catch (e) {
      console.error(e)
      setSaveError(pdfErrorKind(e))
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (saved) URL.revokeObjectURL(saved.url)
    setSaved(undefined)
  }

  function handleStartOver() {
    handleBack()
    setOpened(undefined)
    setPages([])
    setSaveError(undefined)
    setAnnouncement('')
  }

  const screen = !opened ? 'pick' : saved ? 'result' : 'edit'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would make the browser open it instead, losing the changes. Ignore it.
  useEffect(() => {
    if (screen === 'pick') return
    const ignore = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', ignore)
    window.addEventListener('drop', ignore)
    return () => {
      window.removeEventListener('dragover', ignore)
      window.removeEventListener('drop', ignore)
    }
  }, [screen])

  // The result's preview: the first kept page, turned as it will be.
  const first = pages.find((page) => !page.deleted)
  const firstPicture = first && pictures.get(first.index)

  return (
    <section
      className={`flex flex-1 flex-col items-center ${
        screen === 'pick'
          ? 'justify-center py-12 text-center sm:py-20'
          : 'py-6 sm:py-10'
      } ${screen === 'result' ? 'text-center' : ''}`}
    >
      <h1
        className={`font-semibold tracking-tight ${
          screen === 'pick' ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-3xl'
        }`}
      >
        {manifest.name}
      </h1>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {screen === 'pick' && (
        <>
          <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
            Reorder, rotate and delete the pages of a PDF.
          </p>
          <FileDrop
            what="a PDF"
            hint={`PDF · up to ${formatSize(MAX_FILE_SIZE)} and ${MAX_PAGES} pages`}
            accept={ACCEPT}
            check={checkPdf}
            onFiles={handleFiles}
            disabled={opening}
          />
          {opening && (
            <p
              role="status"
              className="mt-3 text-sm text-zinc-600 dark:text-zinc-400"
            >
              Opening…
            </p>
          )}
          {openError && (
            <p
              role="alert"
              className="mt-3 text-sm text-red-600 dark:text-red-400"
            >
              {openError}
            </p>
          )}
        </>
      )}

      {screen === 'edit' && opened && (
        <div className="mt-6 w-full">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-medium"
                title={opened.file.name}
              >
                {opened.file.name}
              </p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {pagesLabel(pages.length)} · {formatSize(opened.file.size)}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={handleTurnAll}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
              </svg>
              Rotate all
            </button>
          </div>
          <p className="mt-4 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="pointer-coarse:hidden">
              Drag pages to reorder them. With a keyboard, pick one up with
              Space.
            </span>
            <span className="hidden pointer-coarse:inline">
              Touch and hold a page to drag it somewhere else.
            </span>
          </p>

          <PageGrid
            pages={pages}
            pictures={pictures}
            want={want}
            unwant={unwant}
            onMove={handleMove}
            onTurn={handleTurn}
            onToggleDeleted={handleToggleDeleted}
            locked={saving}
          />

          {/* Stays in view at the bottom, so saving doesn't mean scrolling
              past every page. */}
          <div className="sticky bottom-0 mt-6 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                {plan.length === 0
                  ? 'Keep at least one page.'
                  : keptLabel(pages)}
              </p>
              <button
                type="button"
                disabled={plan.length === 0 || saving}
                aria-busy={saving}
                onClick={handleSave}
                className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {saving ? 'Saving…' : 'Save PDF'}
              </button>
            </div>
            {saveError && (
              <p
                role="alert"
                className="mt-2 text-sm text-red-600 dark:text-red-400"
              >
                {SAVE_ERRORS[saveError]}
              </p>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              disabled={saving}
              onClick={handleStartOver}
              className="-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Choose another PDF
            </button>
          </p>
        </div>
      )}

      {screen === 'result' && saved && (
        <FileResult
          blob={saved.blob}
          url={saved.url}
          name={saved.name}
          downloadLabel="Download PDF"
          details={`${pagesLabel(saved.pages)} · ${formatSize(saved.blob.size)}`}
          preview={
            first &&
            firstPicture && (
              // A fixed square the page fits whichever way it's turned.
              <div className="relative mx-auto flex size-40 items-center justify-center">
                <img
                  src={firstPicture}
                  alt="The first page of the new PDF"
                  style={{ transform: `rotate(${first.turn}deg)` }}
                  className="max-h-full max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                />
              </div>
            )
          }
          back={{ label: 'Keep editing', onClick: handleBack }}
          startOver={{
            label: 'Organise another PDF',
            onClick: handleStartOver,
          }}
        />
      )}
    </section>
  )
}

export default OrganisePdf
