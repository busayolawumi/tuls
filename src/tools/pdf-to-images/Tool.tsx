import { useCallback, useEffect, useRef, useState } from 'react'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { useOnePdf } from '../../components/pdf/useOnePdf'
import { usePagePictures } from '../../components/pdf/usePagePictures'
import { Segmented } from '../../components/Segmented'
import {
  ACCEPT,
  MAX_FILE_SIZE,
  checkPdf,
  pagesLabel,
  pdfBase,
} from '../../engines/pdf/files'
import { pageImageFile } from '../../engines/pdf/pdfjs'
import { formatSize } from '../../lib/format'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import {
  DPI,
  MAX_PAGES,
  MIME,
  allPages,
  chosenLabel,
  imageName,
  imagesLabel,
  loadSettings,
  saveSettings,
  togglePage,
  type Format,
  type Quality,
} from './lib/images'
import { manifest } from './manifest'
import { PageChooser } from './PageChooser'

// Thumbnails fit a box about 150px square; drawn at twice that for sharp
// screens.
const PICTURE_SIZE = 300

const FORMATS: [Format, string][] = [
  ['jpeg', 'JPG'],
  ['png', 'PNG'],
]
const QUALITIES: [Quality, string][] = [
  ['standard', 'Standard'],
  ['high', 'High'],
]

/** One page as an image: which page (from 0), the file and its size. */
type Made = {
  page: number
  blob: Blob
  url: string
  width: number
  height: number
}
type Result = { images: Made[]; format: Format }

/** localStorage, if the browser lets Tuls use it. */
function storage() {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function PdfToImages() {
  useTitle(`${manifest.name} · Tuls`)
  const {
    opened,
    opening,
    error: openError,
    open,
    close,
  } = useOnePdf(MAX_PAGES, manifest.name)
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set())
  const [settings, setSettings] = useState(() => loadSettings(storage()))
  // While making images: how far along it is.
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const stopped = useRef(false)
  const [error, setError] = useState(false)
  const [result, setResult] = useState<Result>()
  // Read out by screen readers after choosing all or none, or stopping.
  const [announcement, setAnnouncement] = useState('')
  const { pictures, want, unwant } = usePagePictures(opened?.doc, PICTURE_SIZE)

  const count = opened?.doc.numPages ?? 0
  const making = progress !== undefined

  const handleFiles = useCallback(
    async ([file]: File[]) => {
      const pdf = await open(file)
      if (!pdf) return
      setChosen(allPages(pdf.doc.numPages))
      setError(false)
    },
    [open],
  )

  const handleToggle = useCallback((page: number) => {
    setChosen((current) => togglePage(current, page))
  }, [])

  function handleAll() {
    setChosen(allPages(count))
    setAnnouncement(`All ${pagesLabel(count)} chosen.`)
  }

  function handleNone() {
    setChosen(new Set())
    setAnnouncement('No pages chosen.')
  }

  function handleSettings(change: Partial<typeof settings>) {
    const next = { ...settings, ...change }
    setSettings(next)
    saveSettings(storage(), next)
  }

  async function handleMake() {
    if (!opened || chosen.size === 0 || making) return
    const pages = [...chosen].sort((a, b) => a - b)
    const { format, quality } = settings
    stopped.current = false
    setError(false)
    const made: Made[] = []
    try {
      // One page at a time, so only one big canvas is ever in memory.
      for (const [i, page] of pages.entries()) {
        setProgress({ done: i, total: pages.length })
        const image = await pageImageFile(
          opened.doc,
          page + 1,
          DPI[quality],
          MIME[format],
        )
        if (stopped.current) break
        made.push({ page, ...image, url: URL.createObjectURL(image.blob) })
      }
      if (stopped.current) {
        for (const image of made) URL.revokeObjectURL(image.url)
        setAnnouncement('Stopped. No images were made.')
        return
      }
      setResult({ images: made, format })
    } catch (e) {
      console.error(e)
      for (const image of made) URL.revokeObjectURL(image.url)
      setError(true)
    } finally {
      setProgress(undefined)
    }
  }

  // The files' addresses are let go along with them.
  useEffect(() => {
    if (!result) return
    return () => {
      for (const image of result.images) URL.revokeObjectURL(image.url)
    }
  }, [result])

  // The result shows each page's thumbnail, which may not have been drawn
  // yet if it was never scrolled to.
  useEffect(() => {
    for (const image of result?.images ?? []) want(image.page)
  }, [result, want])

  function handleStartOver() {
    setResult(undefined)
    close()
    setChosen(new Set())
    setError(false)
    setAnnouncement('')
  }

  const screen = !opened ? 'pick' : result ? 'result' : 'choose'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would be opened by the browser, losing the choices.
  useIgnoreFileDrops(screen !== 'pick')

  const base = opened ? pdfBase(opened.file.name) : ''
  const detail = (image: Made) =>
    `Page ${image.page + 1} · ${image.width}×${image.height}`
  const textButton =
    '-my-2 px-2 py-2 text-sm text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400'

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
            Turn the pages of a PDF into JPG or PNG images.
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

      {screen === 'choose' && opened && (
        <div className="mt-6 w-full">
          <p className="truncate text-sm font-medium" title={opened.file.name}>
            {opened.file.name}
          </p>
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {pagesLabel(count)} · {formatSize(opened.file.size)}
          </p>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            <Segmented
              legend="Format"
              name="format"
              options={FORMATS}
              value={settings.format}
              onChange={(format) => handleSettings({ format })}
              disabled={making}
            />
            <Segmented
              legend="Quality"
              name="quality"
              options={QUALITIES}
              value={settings.quality}
              onChange={(quality) => handleSettings({ quality })}
              disabled={making}
            />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Standard suits screens. High suits printing, and makes bigger files.
          </p>

          <div className="mt-5 mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Untick the pages you don’t need.
            </p>
            <p className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={making}
                onClick={handleAll}
                className={textButton}
              >
                All
              </button>
              <button
                type="button"
                disabled={making}
                onClick={handleNone}
                className={textButton}
              >
                None
              </button>
            </p>
          </div>

          <PageChooser
            count={count}
            chosen={chosen}
            pictures={pictures}
            want={want}
            unwant={unwant}
            onToggle={handleToggle}
            locked={making}
          />

          {/* Stays in view at the bottom, so making the images doesn't mean
              scrolling past every page. */}
          <div className="sticky bottom-0 mt-6 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex items-center gap-3">
              <p
                role={making ? 'status' : undefined}
                className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-400"
              >
                {progress
                  ? `Page ${progress.done + 1} of ${progress.total}…`
                  : chosenLabel(chosen.size, count)}
              </p>
              {making ? (
                <button
                  type="button"
                  onClick={() => {
                    stopped.current = true
                  }}
                  className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  disabled={chosen.size === 0}
                  onClick={handleMake}
                  className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Make images
                </button>
              )}
            </div>
            {error && (
              <p
                role="alert"
                className="mt-2 text-sm text-red-600 dark:text-red-400"
              >
                Something went wrong making the images. Try again, or try
                Standard quality.
              </p>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              disabled={making}
              onClick={handleStartOver}
              className="-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Choose another PDF
            </button>
          </p>
        </div>
      )}

      {screen === 'result' &&
        result &&
        (result.images.length === 1 ? (
          <FileResult
            blob={result.images[0].blob}
            url={result.images[0].url}
            name={imageName(base, result.images[0].page, result.format)}
            downloadLabel="Download image"
            details={`${detail(result.images[0])} · ${formatSize(result.images[0].blob.size)}`}
            preview={
              <img
                src={result.images[0].url}
                alt={`Page ${result.images[0].page + 1} as an image`}
                className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
              />
            }
            back={{
              label: 'Back to the pages',
              onClick: () => setResult(undefined),
            }}
            startOver={{
              label: 'Choose another PDF',
              onClick: handleStartOver,
            }}
          />
        ) : (
          <FilesResult
            files={result.images.map((image) => ({
              ...image,
              picture: pictures.get(image.page),
              detail: detail(image),
            }))}
            start={base}
            nameOf={(name, i) =>
              imageName(name, result.images[i].page, result.format)
            }
            count={imagesLabel(result.images.length)}
            label="The images"
            back={{
              label: 'Back to the pages',
              onClick: () => setResult(undefined),
            }}
            startOver={{
              label: 'Choose another PDF',
              onClick: handleStartOver,
            }}
          />
        ))}
    </section>
  )
}

export default PdfToImages
