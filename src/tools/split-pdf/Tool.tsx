import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FileDrop } from '../../components/FileDrop'
import { useOnePdf } from '../../components/pdf/useOnePdf'
import { usePagePictures } from '../../components/pdf/usePagePictures'
import { splitPdfInBackground } from '../../engines/pdf/client'
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
import { formatSize } from '../../lib/format'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import {
  MAX_PAGES,
  cutEvery,
  partsFor,
  partsLabel,
  toggleCut,
  zipName,
  type Cuts,
} from './lib/parts'
import { manifest } from './manifest'
import { PartsResult, type Made, type MadePart } from './PartsResult'
import { SplitGrid } from './SplitGrid'

// Thumbnails fit a box about 150px square; drawn at twice that for sharp
// screens.
const PICTURE_SIZE = 300

type Result = { parts: MadePart[]; zip?: Made }

const SPLIT_ERRORS: Record<PdfErrorKind, string> = {
  password: PDF_ERROR_MESSAGES.password,
  unreadable: 'This PDF couldn’t be read, so it couldn’t be split.',
  memory:
    'Your device ran out of memory splitting this PDF. Try a computer, or a smaller PDF.',
  unknown: 'Something went wrong splitting this PDF. Try again.',
}

const NO_CUTS: Cuts = new Set()

function SplitPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const {
    opened,
    opening,
    error: openError,
    open,
    close,
  } = useOnePdf(MAX_PAGES, manifest.name)
  // A PDF that opened fine but has nothing to split.
  const [onePage, setOnePage] = useState(false)
  const [cuts, setCuts] = useState<Cuts>(NO_CUTS)
  const [every, setEvery] = useState('2')
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState<PdfErrorKind>()
  const [result, setResult] = useState<Result>()
  // Read out by screen readers after the splits change.
  const [announcement, setAnnouncement] = useState('')
  const { pictures, want, unwant } = usePagePictures(opened?.doc, PICTURE_SIZE)

  const count = opened?.doc.numPages ?? 0
  const parts = opened ? partsFor(opened.file.name, count, cuts) : []

  const handleFiles = useCallback(
    async ([file]: File[]) => {
      setOnePage(false)
      const pdf = await open(file)
      if (!pdf) return
      if (pdf.doc.numPages < 2) {
        close()
        setOnePage(true)
        return
      }
      setCuts(NO_CUTS)
      setSplitError(undefined)
    },
    [open, close],
  )

  const handleToggleCut = useCallback((index: number, cut: boolean) => {
    setCuts((current) => toggleCut(current, index))
    setAnnouncement(
      cut
        ? `No split after page ${index + 1}.`
        : `Split after page ${index + 1}.`,
    )
  }, [])

  function splitEvery(n: number) {
    const next = cutEvery(count, n)
    setCuts(next)
    const made = partsLabel(next.size + 1)
    setAnnouncement(
      n === 1
        ? `Split after every page: ${made}.`
        : `Split every ${n} pages: ${made}.`,
    )
  }

  function handleEvery(e: FormEvent) {
    e.preventDefault()
    const n = Number(every)
    if (n >= 1) splitEvery(n)
  }

  function handleClear() {
    setCuts(NO_CUTS)
    setAnnouncement('Splits cleared.')
  }

  async function handleSplit() {
    if (!opened || parts.length < 2 || splitting) return
    setSplitting(true)
    setSplitError(undefined)
    try {
      const { files, zip } = await splitPdfInBackground(
        await opened.file.arrayBuffer(),
        parts,
      )
      const made = (
        name: string,
        bytes: Uint8Array<ArrayBuffer>,
        type: string,
      ) => {
        const blob = new Blob([bytes], { type })
        return { name, blob, url: URL.createObjectURL(blob) }
      }
      setResult({
        parts: parts.map((part, i) => ({
          ...made(part.name, files[i], 'application/pdf'),
          pages: part.pages,
        })),
        zip: zip && made(zipName(opened.file.name), zip, 'application/zip'),
      })
    } catch (e) {
      console.error(e)
      setSplitError(pdfErrorKind(e))
    } finally {
      setSplitting(false)
    }
  }

  // The files' addresses are let go along with them.
  useEffect(() => {
    if (!result) return
    return () => {
      for (const part of result.parts) URL.revokeObjectURL(part.url)
      if (result.zip) URL.revokeObjectURL(result.zip.url)
    }
  }, [result])

  // The result lists each part with its first page, which may not have
  // been drawn yet if it was never scrolled to.
  useEffect(() => {
    for (const part of result?.parts ?? []) want(part.pages[0])
  }, [result, want])

  function handleStartOver() {
    setResult(undefined)
    close()
    setCuts(NO_CUTS)
    setSplitError(undefined)
    setAnnouncement('')
  }

  const screen = !opened ? 'pick' : result ? 'result' : 'edit'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would be opened by the browser, losing the splits.
  useIgnoreFileDrops(screen !== 'pick')

  const pickError = onePage
    ? 'This PDF has just one page, so there’s nothing to split.'
    : openError
  const secondary =
    'rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800'

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
            Split a PDF into several smaller ones, at the pages you choose.
          </p>
          <FileDrop
            what="a PDF"
            hint={`PDF · up to ${formatSize(MAX_FILE_SIZE)} and ${MAX_PAGES.toLocaleString()} pages`}
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
          {pickError && (
            <p
              role="alert"
              className="mt-3 text-sm text-red-600 dark:text-red-400"
            >
              {pickError}
            </p>
          )}
        </>
      )}

      {screen === 'edit' && opened && (
        <div className="mt-6 w-full">
          <p className="truncate text-sm font-medium" title={opened.file.name}>
            {opened.file.name}
          </p>
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {pagesLabel(count)} · {formatSize(opened.file.size)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={splitting}
              onClick={() => splitEvery(1)}
              className={secondary}
            >
              Every page
            </button>
            <form
              onSubmit={handleEvery}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 py-1 pr-1 pl-3 text-sm dark:border-zinc-700"
            >
              <label className="flex items-center gap-1.5">
                Every
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={count}
                  value={every}
                  disabled={splitting}
                  onChange={(e) => setEvery(e.target.value)}
                  className="w-14 rounded-md border border-zinc-300 bg-transparent px-1.5 py-1 text-center dark:border-zinc-700"
                />
                pages
              </label>
              <button
                type="submit"
                disabled={splitting}
                className="rounded-md bg-zinc-100 px-2.5 py-1 font-medium transition hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                Apply
              </button>
            </form>
            {cuts.size > 0 && (
              <button
                type="button"
                disabled={splitting}
                onClick={handleClear}
                className="-my-2 px-2 py-2 text-sm text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-zinc-400"
              >
                Clear splits
              </button>
            )}
          </div>
          <p className="mt-4 mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Or use the scissors under a page to split after it.
          </p>

          <SplitGrid
            count={count}
            cuts={cuts}
            pictures={pictures}
            want={want}
            unwant={unwant}
            onToggleCut={handleToggleCut}
            locked={splitting}
          />

          {/* Stays in view at the bottom, so splitting doesn't mean scrolling
              past every page. */}
          <div className="sticky bottom-0 mt-6 border-t border-zinc-200 bg-white/95 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-zinc-600 dark:text-zinc-400">
                {parts.length < 2
                  ? 'Choose where to split.'
                  : partsLabel(parts.length)}
              </p>
              <button
                type="button"
                disabled={parts.length < 2 || splitting}
                aria-busy={splitting}
                onClick={handleSplit}
                className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {splitting ? 'Splitting…' : 'Split PDF'}
              </button>
            </div>
            {splitError && (
              <p
                role="alert"
                className="mt-2 text-sm text-red-600 dark:text-red-400"
              >
                {SPLIT_ERRORS[splitError]}
              </p>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              disabled={splitting}
              onClick={handleStartOver}
              className="-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline disabled:opacity-50"
            >
              Choose another PDF
            </button>
          </p>
        </div>
      )}

      {screen === 'result' && result && (
        <PartsResult
          parts={result.parts}
          zip={result.zip}
          pictures={pictures}
          back={{
            label: 'Change the splits',
            onClick: () => setResult(undefined),
          }}
          startOver={{ label: 'Split another PDF', onClick: handleStartOver }}
        />
      )}
    </section>
  )
}

export default SplitPdf
