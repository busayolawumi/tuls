import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ProgressPanel } from '../../components/ProgressPanel'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import { ACCEPT } from '../../engines/pdf/files'
import { DOWNLOAD_SIZE, isEngineSaved } from '../../engines/pymupdf/download'
import {
  convertToWord,
  holdEngine,
  releaseEngine,
  stopEngine,
  type EngineStep,
} from '../../engines/pymupdf/engine'
import {
  WORD_ERROR_MESSAGES,
  wordErrorKind,
  type WordErrorKind,
} from '../../engines/pymupdf/errors'
import { progressRatio } from '../../engines/pymupdf/progress'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import { outputNames } from '../../lib/outputNames'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import {
  checkPdfFile,
  fromPages,
  leftOutPages,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PAGES,
  scanNote,
  tooManyPages,
} from './lib/files'
import { inspectPdf, type Inspected } from './lib/inspect'
import { manifest } from './manifest'

// PDFs in, Word documents out, with PyMuPDF and pdf2docx (engines/pymupdf)
// doing the work. Each PDF is checked first with pdf.js: scanned pages, which
// stay pictures in Word, are pointed out before converting. Several PDFs can
// go in at once; they're converted one after another by the one engine.

type Checked = Inspected & { file: File }
/** A Word file made from a PDF. */
type Made = {
  name: string
  blob: Blob
  url: string
  pages: number
  picture: string | null
  /** Pages pdf2docx couldn't convert, from 1. */
  leftOut: number[]
}
type Checking = { index: number; total: number; name: string }
type Working = { step: EngineStep; index: number; total: number; name: string }

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:pdf-to-word:converting',
)

/** What to say when the engine itself couldn't be had. */
function engineMessage(kind: WordErrorKind) {
  if (kind === 'network') return WORD_ERROR_MESSAGES.network
  if (kind === 'memory') {
    return 'The converter needs more memory than this browser could give it. A computer should work.'
  }
  return 'The converter couldn’t start. Reload the page and try again, or try another browser.'
}

function stepLabel({ step, name, index, total }: Working) {
  if (step.step === 'download') return 'Downloading the converter…'
  if (step.step === 'start') return 'Starting the converter…'
  const which = total > 1 ? `${index + 1} of ${total}: ${name}` : name
  const progress = step.progress
  if (!progress) return `Converting ${which}…`
  const verb = progress.phase === 'reading' ? 'reading' : 'writing'
  return `Converting ${which}, ${verb} page ${progress.page} of ${progress.pages}…`
}

function stepRatio({ step, index, total }: Working) {
  if (step.step === 'download') return step.ratio
  if (step.step !== 'convert') return undefined
  const within = step.progress ? progressRatio(step.progress) : 0
  return (index + within) / total
}

function PdfToWord() {
  useTitle(`${manifest.name} · Tuls`)
  const [checking, setChecking] = useState<Checking>()
  const [review, setReview] = useState<{
    ready: Checked[]
    problems: Failed[]
  }>()
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  // A problem with the engine itself, rather than with one PDF.
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<boolean>()
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  // Each run gets a number; cancelling or leaving moves it on, so a run
  // that's no longer wanted stops showing its results.
  const run = useRef(0)
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)

  // The engine stays running while the page is open.
  useEffect(() => {
    holdEngine()
    const runs = run
    return () => {
      runs.current++
      releaseEngine()
    }
  }, [])

  useEffect(() => {
    void isEngineSaved().then(setSaved)
  }, [made])

  const convert = useCallback(async (ready: Checked[], problems: Failed[]) => {
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setReview(undefined)
    setError(undefined)
    markConverting()
    try {
      for (const [index, item] of ready.entries()) {
        // Changed by `show`, so TypeScript mustn't narrow it to 'start'.
        let step = { step: 'start' } as EngineStep
        const show = (next: EngineStep) => {
          step = next
          if (wanted()) {
            setWorking({
              step,
              index,
              total: ready.length,
              name: item.file.name,
            })
          }
        }
        show(step)
        try {
          const { docx, leftOut } = await convertToWord(
            item.file,
            item.pages,
            show,
          )
          if (!wanted()) return abandon()
          const blob = new Blob([docx], { type: DOCX })
          done.push({
            name: item.file.name,
            blob,
            url: URL.createObjectURL(blob),
            pages: item.pages,
            picture: item.picture,
            leftOut,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          // Handled: the page says what went wrong.
          console.warn(e)
          const kind = wordErrorKind(e)
          // No engine, so no point trying the rest.
          if (step.step !== 'convert') {
            abandon()
            setFailed(problems)
            setError(engineMessage(kind))
            return
          }
          problems.push({
            name: item.file.name,
            message: WORD_ERROR_MESSAGES[kind],
          })
        }
      }
      setFailed(problems)
      if (done.length) setMade(done)
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
  }, [])

  const handleFiles = useCallback(
    async (chosen: File[]) => {
      const files = chosen.slice(0, MAX_FILES)
      const id = ++run.current
      const wanted = () => run.current === id
      const ready: Checked[] = []
      const problems: Failed[] = []
      setError(undefined)
      setFailed([])
      setLeftOut(chosen.length - files.length)
      setAnnouncement('')
      try {
        for (const [index, file] of files.entries()) {
          setChecking({ index, total: files.length, name: file.name })
          try {
            const inspected = await inspectPdf(file)
            if (!wanted()) return
            if (inspected.pages > MAX_PAGES) {
              problems.push({
                name: file.name,
                message: tooManyPages(inspected.pages),
              })
            } else {
              ready.push({ ...inspected, file })
            }
          } catch (e) {
            if (!wanted()) return
            console.warn(e)
            problems.push({
              name: file.name,
              message: PDF_ERROR_MESSAGES[pdfErrorKind(e)],
            })
          }
        }
      } finally {
        if (wanted()) setChecking(undefined)
      }
      if (ready.length === 0) return setFailed(problems)
      // Scanned pages are worth knowing about before waiting for them.
      if (ready.some((item) => item.scanned.length > 0)) {
        return setReview({ ready, problems })
      }
      await convert(ready, problems)
    },
    [convert],
  )

  function handleCancel() {
    run.current++
    stopEngine()
    markDone()
    setChecking(undefined)
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was converted.')
  }

  // The files' addresses are let go along with them.
  useEffect(() => {
    if (!made) return
    return () => {
      for (const file of made) URL.revokeObjectURL(file.url)
    }
  }, [made])

  function handleStartOver() {
    setMade(undefined)
    setReview(undefined)
    setFailed([])
    setLeftOut(0)
    setError(undefined)
  }

  const screen = checking
    ? 'checking'
    : working
      ? 'working'
      : made
        ? 'result'
        : review
          ? 'review'
          : 'pick'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would be opened by the browser.
  useIgnoreFileDrops(screen !== 'pick')

  const names = made
    ? outputNames(
        made.map((file) => file.name),
        'docx',
      )
    : []
  const startOver = { label: 'Convert more PDFs', onClick: handleStartOver }
  const leftOutNote = leftOut > 0 && (
    <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
      Up to {MAX_FILES} PDFs can go in at once, so {leftOut}{' '}
      {leftOut === 1 ? 'was' : 'were'} left out.
    </p>
  )

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
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {screen === 'pick' && (
        <>
          <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
            Turn PDFs into Word documents you can edit. Works best with PDFs
            made from documents: text, headings, lists and tables.
          </p>
          <FileDrop
            what="PDFs"
            hint={`PDF · up to ${formatSize(MAX_FILE_SIZE)} and ${MAX_PAGES} pages each`}
            accept={ACCEPT}
            multiple
            check={checkPdfFile}
            onFiles={handleFiles}
          />
          {error && (
            <p
              role="alert"
              className="mt-4 max-w-md text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          {failed.length > 0 && <FailedList failed={failed} />}
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while converting. If it closed by
              itself, the device probably ran out of memory: a shorter PDF, or a
              computer, should work.
            </p>
          )}
          {(saved === false || phone) && (
            <div className="mt-2 max-w-md space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {saved === false && (
                <p>
                  The converter is a {formatSize(DOWNLOAD_SIZE)} download the
                  first time, then it’s kept on this device.
                </p>
              )}
              {phone && (
                <p>
                  On a phone, long PDFs take a while, and very big ones may not
                  fit in its memory.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {screen === 'checking' && checking && (
        <ProgressPanel
          label={
            checking.total > 1
              ? `Checking ${checking.index + 1} of ${checking.total}: ${checking.name}…`
              : `Checking ${checking.name}…`
          }
          ratio={
            checking.total > 1 ? checking.index / checking.total : undefined
          }
          onCancel={handleCancel}
        />
      )}

      {screen === 'review' && review && (
        <Review
          ready={review.ready}
          problems={review.problems}
          leftOutNote={leftOutNote}
          onConvert={() => void convert(review.ready, [...review.problems])}
          onStartOver={handleStartOver}
        />
      )}

      {screen === 'working' && working && (
        <ProgressPanel
          label={stepLabel(working)}
          ratio={stepRatio(working)}
          note={
            working.step.step === 'download'
              ? `${formatSize(DOWNLOAD_SIZE)}, only needed the first time.`
              : undefined
          }
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && made && (
        <>
          {failed.length > 0 && <FailedList failed={failed} />}
          {made.some((file) => file.leftOut.length > 0) && (
            <FailedList
              failed={made
                .filter((file) => file.leftOut.length > 0)
                .map((file) => ({
                  name: file.name,
                  message: leftOutPages(file.leftOut),
                }))}
            />
          )}
          {leftOutNote}
          {made.length === 1 ? (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={names[0]}
              downloadLabel="Download Word file"
              details={`${fromPages(made[0].pages)} · ${formatSize(made[0].blob.size)}`}
              preview={
                made[0].picture && (
                  <img
                    src={made[0].picture}
                    alt={`The first page of ${made[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              startOver={startOver}
            />
          ) : (
            <FilesResult
              files={made.map((file) => ({
                blob: file.blob,
                url: file.url,
                picture: file.picture,
                detail: fromPages(file.pages),
              }))}
              start="Word files"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${made.length} Word files`}
              label="The Word files"
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Complex layouts, forms and some tables can come out differently, so
            check the Word file before you send it.
          </p>
        </>
      )}
    </section>
  )
}

/** Before converting PDFs with scanned pages: which, and what to expect. */
function Review({
  ready,
  problems,
  leftOutNote,
  onConvert,
  onStartOver,
}: {
  ready: Checked[]
  problems: Failed[]
  leftOutNote: ReactNode
  onConvert: () => void
  onStartOver: () => void
}) {
  return (
    <div className="mt-8 w-full max-w-xl text-left">
      <ul className="space-y-3" aria-label="The PDFs">
        {ready.map((item, i) => {
          const note = scanNote(item.pages, item.scanned)
          return (
            // Two PDFs can share a name.
            <li
              key={i}
              className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
            >
              <p className="truncate font-medium" title={item.file.name}>
                {item.file.name}
              </p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {note ?? 'Ready to convert.'}
              </p>
            </li>
          )
        })}
      </ul>
      {problems.length > 0 && <FailedList failed={problems} />}
      {leftOutNote}
      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Tuls can’t read the text in scanned pages yet.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={onConvert}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Convert anyway
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="-mx-2 -my-3.5 px-2 py-3.5 text-sm text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Choose other PDFs
        </button>
      </div>
    </div>
  )
}

export default PdfToWord
