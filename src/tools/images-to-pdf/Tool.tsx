import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { Segmented } from '../../components/Segmented'
import { moveTo } from '../../components/sortable/moveTo'
import { imagesToPdfInBackground } from '../../engines/pdf/client'
import { pdfErrorKind, type PdfErrorKind } from '../../engines/pdf/errors'
import { pagesLabel } from '../../engines/pdf/files'
import type { PageSize } from '../../engines/pdf/images'
import { formatSize } from '../../lib/format'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { ImageGrid, type Item } from './ImageGrid'
import {
  ACCEPT,
  MAX_IMAGES,
  MAX_IMAGE_SIZE,
  checkImage,
  imagesLabel,
  loadPageSize,
  pdfName,
  savePageSize,
} from './lib/images'
import { imagePicture, pageImage } from './lib/prepare'
import { manifest } from './manifest'

// Thumbnails fit a box about 150px square; drawn at twice that for sharp
// screens.
const PICTURE_SIZE = 300

const SIZES: [PageSize, string][] = [
  ['fit', 'Same as image'],
  ['a4', 'A4'],
  ['letter', 'Letter'],
]

const MAKE_ERRORS: Record<PdfErrorKind, string> = {
  password: 'Something went wrong making the PDF. Try again.',
  unreadable: 'One of the images couldn’t be read. Remove it and try again.',
  memory:
    'Your device ran out of memory making this PDF. Try fewer or smaller images.',
  unknown: 'Something went wrong making the PDF. Try again.',
}

type Made = { blob: Blob; url: string; name: string; pages: number }

/** localStorage, if the browser lets Tuls use it. */
function storage() {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function ImagesToPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [items, setItems] = useState<Item[]>([])
  const [size, setSize] = useState<PageSize>(() => loadPageSize(storage()))
  // Said when more images are chosen than fit in one PDF.
  const [note, setNote] = useState<string>()
  const [making, setMaking] = useState(false)
  const [error, setError] = useState<PdfErrorKind>()
  const [made, setMade] = useState<Made>()
  // Read out by screen readers after adding, turning or removing.
  const [announcement, setAnnouncement] = useState('')
  const list = useRef<HTMLOListElement>(null)

  // Thumbnails are drawn one at a time, in the order the images came, and
  // not at all for images removed before their turn.
  const drawing = useRef(Promise.resolve())
  const listed = useRef(new Set<string>())
  // How many images there are, for adding more without going past the limit.
  const count = useRef(0)
  useEffect(() => {
    count.current = items.length
  }, [items])

  const handleFiles = useCallback((files: File[]) => {
    const room = Math.max(0, MAX_IMAGES - count.current)
    const taken = files.slice(0, room)
    const left = files.length - taken.length
    setNote(
      left > 0
        ? `One PDF can have up to ${MAX_IMAGES} images, so ${left} ${left === 1 ? 'was' : 'were'} left out.`
        : undefined,
    )
    if (taken.length === 0) return
    const added = taken.map((file) => ({
      id: crypto.randomUUID(),
      file,
      turn: 0,
    }))
    count.current += added.length
    setItems((current) => [...current, ...added])
    setError(undefined)
    setAnnouncement(
      `Added ${added.length === 1 ? added[0].file.name : imagesLabel(added.length)}.`,
    )
    for (const { id, file } of added) {
      listed.current.add(id)
      drawing.current = drawing.current.then(async () => {
        if (!listed.current.has(id)) return
        let picture: string | null
        try {
          picture = await imagePicture(file, PICTURE_SIZE)
        } catch (e) {
          console.warn(`Couldn't open ${file.name}:`, e)
          picture = null
        }
        setItems((current) =>
          current.map((item) => (item.id === id ? { ...item, picture } : item)),
        )
      })
    }
  }, [])

  const handleMove = useCallback((id: string, to: string) => {
    setItems((current) => moveTo(current, id, to))
  }, [])

  const handleTurn = useCallback((item: Item) => {
    const turn = (item.turn + 90) % 360
    setItems((current) =>
      current.map((other) =>
        other.id === item.id ? { ...other, turn } : other,
      ),
    )
    setAnnouncement(`${item.file.name} turned to ${turn}°.`)
  }, [])

  const handleRemove = useCallback((item: Item) => {
    listed.current.delete(item.id)
    setItems((current) => current.filter((other) => other.id !== item.id))
    setAnnouncement(`Removed ${item.file.name}.`)
    // The button that had focus is gone, so keep the keyboard in the grid.
    list.current?.focus()
  }, [])

  function handleSize(next: PageSize) {
    setSize(next)
    savePageSize(storage(), next)
  }

  const opening = items.some((item) => item.picture === undefined)
  const problems = items.filter((item) => item.picture === null)
  const canMake =
    items.length > 0 && !opening && problems.length === 0 && !making

  async function handleMake() {
    if (!canMake) return
    setMaking(true)
    setError(undefined)
    try {
      // One at a time: redrawing big photos takes a lot of memory.
      const images = []
      for (const item of items)
        images.push(await pageImage(item.file, item.turn))
      const bytes = await imagesToPdfInBackground(images, size)
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
        type: 'application/pdf',
      })
      setMade({
        blob,
        url: URL.createObjectURL(blob),
        name: pdfName(items[0].file.name),
        pages: items.length,
      })
    } catch (e) {
      console.error(e)
      setError(pdfErrorKind(e))
    } finally {
      setMaking(false)
    }
  }

  // The file's address is let go along with it.
  useEffect(() => {
    if (!made) return
    return () => URL.revokeObjectURL(made.url)
  }, [made])

  function handleStartOver() {
    setMade(undefined)
    listed.current.clear()
    setItems([])
    setError(undefined)
    setNote(undefined)
    setAnnouncement('')
  }

  const screen = items.length === 0 ? 'pick' : made ? 'result' : 'list'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // The result has no drop zone, so a file dropped by mistake would be
  // opened by the browser, leaving Tuls.
  useIgnoreFileDrops(screen === 'result')

  const first = items[0]
  const status = problems.length
    ? 'Remove the images that can’t be opened to make the PDF.'
    : opening
      ? 'Opening images…'
      : imagesLabel(items.length)

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
      {screen === 'pick' && (
        <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
          Turn photos, scans and screenshots into one PDF.
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {screen !== 'result' && (
        // One drop zone for both screens, so a message about a file that was
        // turned down stays when the others move on to the grid.
        <div className="w-full">
          {screen === 'list' && (
            <>
              <div className="mt-6">
                <Segmented
                  legend="Page size"
                  name="page-size"
                  options={SIZES}
                  value={size}
                  onChange={handleSize}
                  disabled={making}
                />
              </div>
              <p className="mt-4 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                <span className="pointer-coarse:hidden">
                  Drag images to change the order. With a keyboard, pick one up
                  with Space.
                </span>
                <span className="hidden pointer-coarse:inline">
                  Touch and hold an image to drag it somewhere else.
                </span>
              </p>
              <ImageGrid
                items={items}
                onMove={handleMove}
                onTurn={handleTurn}
                onRemove={handleRemove}
                locked={making}
                listRef={list}
              />
            </>
          )}

          <div className="flex w-full flex-col items-center">
            <FileDrop
              what="images"
              hint={`JPG, PNG, WebP, GIF or HEIC · up to ${MAX_IMAGES}, ${formatSize(MAX_IMAGE_SIZE)} each`}
              accept={ACCEPT}
              multiple
              check={checkImage}
              onFiles={handleFiles}
              compact={screen === 'list'}
              disabled={making}
            />
            {note && (
              <p
                role="status"
                className="mt-3 text-sm text-zinc-600 dark:text-zinc-400"
              >
                {note}
              </p>
            )}
          </div>

          {screen === 'list' && (
            // Stays in view at the bottom, so making the PDF doesn't mean
            // scrolling past every image.
            <div className="sticky bottom-0 mt-6 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {status}
                </p>
                <button
                  type="button"
                  disabled={!canMake}
                  aria-busy={making}
                  onClick={handleMake}
                  className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {making ? 'Making…' : 'Make PDF'}
                </button>
              </div>
              {error && (
                <p
                  role="alert"
                  className="mt-2 text-sm text-red-600 dark:text-red-400"
                >
                  {MAKE_ERRORS[error]}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {screen === 'result' && made && (
        <FileResult
          blob={made.blob}
          url={made.url}
          name={made.name}
          downloadLabel="Download PDF"
          details={`${pagesLabel(made.pages)} · ${formatSize(made.blob.size)}`}
          preview={
            first?.picture && (
              // A fixed square the image fits whichever way it's turned.
              <div className="relative mx-auto flex size-40 items-center justify-center">
                <img
                  src={first.picture}
                  alt="The first page of the new PDF"
                  style={{ transform: `rotate(${first.turn}deg)` }}
                  className="max-h-full max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                />
              </div>
            )
          }
          back={{
            label: 'Back to the images',
            onClick: () => setMade(undefined),
          }}
          startOver={{ label: 'Use other images', onClick: handleStartOver }}
        />
      )}
    </section>
  )
}

export default ImagesToPdf
