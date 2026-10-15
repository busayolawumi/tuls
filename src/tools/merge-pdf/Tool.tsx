import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { mergePdfsInBackground } from '../../engines/pdf/client'
import {
  PDF_ERROR_MESSAGES,
  pdfErrorKind,
  type PdfErrorKind,
} from '../../engines/pdf/errors'
import {
  ACCEPT,
  MAX_FILE_SIZE,
  checkPdf,
  pagesLabel,
} from '../../engines/pdf/files'
import { closePdf, openPdf, pagePicture } from '../../engines/pdf/pdfjs'
import { formatSize } from '../../lib/format'
import { useTitle } from '../../lib/useTitle'
import { mergedFileName, move } from './lib/files'
import { manifest } from './manifest'

// Thumbnails are shown 56px tall; drawn at twice that for sharp screens.
const PICTURE_HEIGHT = 112

type Item = {
  id: string
  file: File
  /** Filled in once pdf.js has opened it. */
  pages?: number
  picture?: string
  problem?: PdfErrorKind
}

type Merged = { blob: Blob; url: string; name: string; pages: number }

const MERGE_ERRORS: Record<PdfErrorKind, string> = {
  password: PDF_ERROR_MESSAGES.password,
  unreadable: 'One of these PDFs couldn’t be read, so they couldn’t be merged.',
  memory:
    'Your device ran out of memory merging these PDFs. Try fewer or smaller files.',
  unknown: 'Something went wrong merging these PDFs. Try again.',
}

function MergePdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [items, setItems] = useState<Item[]>([])
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<PdfErrorKind>()
  const [merged, setMerged] = useState<Merged>()
  // Read out by screen readers after a move, add or remove.
  const [announcement, setAnnouncement] = useState('')
  const list = useRef<HTMLOListElement>(null)

  const update = (id: string, change: Partial<Item>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...change } : item)),
    )

  const handleFiles = useCallback((files: File[]) => {
    const added = files.map((file) => ({ id: crypto.randomUUID(), file }))
    setItems((current) => [...current, ...added])
    setError(undefined)
    setAnnouncement(
      `Added ${files.length === 1 ? files[0].name : `${files.length} PDFs`}.`,
    )
    // Open each one to count its pages and draw its first page.
    for (const { id, file } of added) {
      ;(async () => {
        try {
          const doc = await openPdf(await file.arrayBuffer())
          try {
            update(id, {
              pages: doc.numPages,
              picture: await pagePicture(doc, 1, PICTURE_HEIGHT),
            })
          } finally {
            await closePdf(doc)
          }
        } catch (e) {
          console.warn(`Couldn't open ${file.name}:`, e)
          update(id, { problem: pdfErrorKind(e) })
        }
      })()
    }
  }, [])

  function handleMove(index: number, to: number) {
    const item = items[index]
    setItems(move(items, index, to))
    setAnnouncement(
      `Moved ${item.file.name} to position ${to + 1} of ${items.length}.`,
    )
  }

  function handleRemove(index: number) {
    const item = items[index]
    setItems(items.filter((_, i) => i !== index))
    setAnnouncement(`Removed ${item.file.name}.`)
    // The button that had focus is gone, so keep the keyboard in the list.
    list.current?.focus()
  }

  const ready = items.filter((item) => item.pages !== undefined)
  const opening = items.some((item) => !item.pages && !item.problem)
  const hasProblems = items.some((item) => item.problem)
  const canMerge = ready.length >= 2 && !opening && !hasProblems && !merging

  async function handleMerge() {
    if (!canMerge) return
    setMerging(true)
    setError(undefined)
    try {
      const buffers = await Promise.all(
        items.map((item) => item.file.arrayBuffer()),
      )
      const bytes = await mergePdfsInBackground(buffers)
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: 'application/pdf',
      })
      setMerged({
        blob,
        url: URL.createObjectURL(blob),
        name: mergedFileName(items[0].file.name),
        pages: items.reduce((sum, item) => sum + (item.pages ?? 0), 0),
      })
    } catch (e) {
      console.error(e)
      setError(pdfErrorKind(e))
    } finally {
      setMerging(false)
    }
  }

  function handleBack() {
    if (merged) URL.revokeObjectURL(merged.url)
    setMerged(undefined)
  }

  function handleStartOver() {
    handleBack()
    setItems([])
    setError(undefined)
  }

  const screen = items.length === 0 ? 'pick' : merged ? 'result' : 'list'
  // Each screen starts at the top, as in Video to GIF.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  return (
    <section
      className={`flex flex-1 flex-col items-center text-center ${
        screen === 'pick' ? 'justify-center py-12 sm:py-20' : 'py-6 sm:py-10'
      }`}
    >
      <h1
        className={`font-semibold tracking-tight ${
          screen === 'pick' ? 'text-4xl sm:text-6xl' : 'text-2xl sm:text-3xl'
        }`}
      >
        {manifest.name}
      </h1>
      {screen === 'pick' && (
        <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
          Combine several PDFs into one, in the order you choose.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {screen !== 'result' && (
        // One drop zone for both screens, so a message about a file that was
        // turned down stays when the others move on to the list.
        <div className="flex w-full max-w-xl flex-col items-center">
          {screen === 'list' && (
            <ol
              ref={list}
              tabIndex={-1}
              aria-label="PDFs to merge, in order"
              className="mt-6 flex w-full flex-col gap-2 text-left outline-none"
            >
              {items.map((item, index) => (
                <FileRow
                  key={item.id}
                  item={item}
                  position={index + 1}
                  count={items.length}
                  locked={merging}
                  onMoveUp={() => handleMove(index, index - 1)}
                  onMoveDown={() => handleMove(index, index + 1)}
                  onRemove={() => handleRemove(index)}
                />
              ))}
            </ol>
          )}

          <FileDrop
            what="PDFs"
            hint={`PDF · up to ${formatSize(MAX_FILE_SIZE)} each`}
            accept={ACCEPT}
            multiple
            check={checkPdf}
            onFiles={handleFiles}
            compact={screen === 'list'}
            disabled={merging}
          />
        </div>
      )}

      {screen === 'list' && (
        <div className="w-full max-w-xl text-left">
          <div className="mt-6">
            {ready.length < 2 && !opening && !hasProblems && (
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Add at least one more PDF to merge.
              </p>
            )}
            {hasProblems && (
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Remove the PDFs that can’t be opened to merge the rest.
              </p>
            )}
            <button
              type="button"
              disabled={!canMerge}
              aria-busy={merging}
              onClick={handleMerge}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {merging
                ? 'Merging…'
                : `Merge ${items.length} ${items.length === 1 ? 'PDF' : 'PDFs'}`}
            </button>
            {error && (
              <p
                role="alert"
                className="mt-3 text-sm text-red-600 dark:text-red-400"
              >
                {MERGE_ERRORS[error]}
              </p>
            )}
          </div>
        </div>
      )}

      {screen === 'result' && merged && (
        <FileResult
          blob={merged.blob}
          url={merged.url}
          name={merged.name}
          downloadLabel="Download PDF"
          details={`${pagesLabel(merged.pages)} · ${formatSize(merged.blob.size)}`}
          preview={
            items[0].picture && (
              <img
                src={items[0].picture}
                alt="The first page of the merged PDF"
                className="mx-auto h-40 rounded border border-zinc-200 dark:border-zinc-800"
              />
            )
          }
          back={{ label: 'Change the order', onClick: handleBack }}
          startOver={{ label: 'Merge other PDFs', onClick: handleStartOver }}
        />
      )}
    </section>
  )
}

type RowProps = {
  item: Item
  position: number
  count: number
  locked: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function FileRow({
  item,
  position,
  count,
  locked,
  onMoveUp,
  onMoveDown,
  onRemove,
}: RowProps) {
  const name = item.file.name
  const atTop = position === 1
  const atBottom = position === count
  // At the ends, the move buttons are marked unavailable instead of being
  // disabled: a disabled button drops keyboard focus to the top of the page.
  const iconButton =
    'grid size-10 place-items-center rounded-md text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800'
  return (
    <li className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <span className="w-5 shrink-0 text-right font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {position}
      </span>
      {item.picture ? (
        <img
          src={item.picture}
          alt=""
          className="h-14 w-10 shrink-0 rounded-sm border border-zinc-200 object-cover dark:border-zinc-800"
        />
      ) : (
        <span className="h-14 w-10 shrink-0 animate-pulse rounded-sm bg-zinc-100 dark:bg-zinc-900" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={name}>
          {name}
        </p>
        {item.problem ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {PDF_ERROR_MESSAGES[item.problem]}
          </p>
        ) : (
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {item.pages === undefined ? 'Opening…' : pagesLabel(item.pages)} ·{' '}
            {formatSize(item.file.size)}
          </p>
        )}
      </div>
      <div className="flex shrink-0">
        <button
          type="button"
          className={iconButton}
          disabled={locked}
          aria-disabled={atTop || undefined}
          onClick={atTop ? undefined : onMoveUp}
          aria-label={`Move ${name} up`}
        >
          <Icon d="M6 15l6-6 6 6" />
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={locked}
          aria-disabled={atBottom || undefined}
          onClick={atBottom ? undefined : onMoveDown}
          aria-label={`Move ${name} down`}
        >
          <Icon d="M6 9l6 6 6-6" />
        </button>
        <button
          type="button"
          className={iconButton}
          disabled={locked}
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <Icon d="M6 6l12 12M18 6L6 18" />
        </button>
      </div>
    </li>
  )
}

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export default MergePdf
