import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DOWNLOAD_SIZE,
  isEngineSaved,
} from '../../engines/libreoffice/download'
import {
  convertToPdf,
  holdEngine,
  releaseEngine,
  stopEngine,
  type EngineStep,
} from '../../engines/libreoffice/engine'
import {
  OFFICE_ERROR_MESSAGES,
  officeErrorKind,
  type OfficeErrorKind,
} from '../../engines/libreoffice/errors'
import {
  MAX_FILES,
  MAX_FILE_SIZE,
  PHONE_SIZE,
  acceptOf,
  checkDocument,
  contentProblem,
  extensionOf,
  pdfNames,
} from '../../engines/libreoffice/files'
import { cleanPdfInBackground } from '../../engines/pdf/client'
import { pagesLabel } from '../../engines/pdf/files'
import { closePdf, openPdf, pagePicture } from '../../engines/pdf/pdfjs'
import { formatSize } from '../../lib/format'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import type { ToolManifest } from '../../tools/types'
import { FailedList, type Failed } from '../FailedList'
import { FileDrop } from '../FileDrop'
import { FileResult } from '../FileResult'
import { FilesResult } from '../FilesResult'
import { ProgressPanel } from '../ProgressPanel'
import { closedWhileConverting, markConverting, markDone } from './lastRun'

// Word, Excel or PowerPoint to PDF: the same screens for each, with
// LibreOffice (engines/libreoffice) doing the work. Several documents can go
// in at once; they're converted one after another by the one engine.

type Props = {
  manifest: ToolManifest
  /** One document, e.g. "a Word document". */
  one: string
  /** Several, e.g. "Word documents". */
  many: string
  /** The kinds of file, for the small print, e.g. "DOCX, DOC, ODT or RTF". */
  kinds: string
  /** A sentence under the heading. */
  intro: string
}

/** A converted document. */
type Made = {
  name: string
  blob: Blob
  url: string
  pages: number
  picture: string | null
}
type Working = { step: EngineStep; index: number; total: number; name: string }

// Big enough for the result's preview; the list's thumbnails are smaller.
const PICTURE_SIZE = 600

/** The PDF's page count and a picture of its first page. */
async function describePdf(bytes: Uint8Array) {
  const doc = await openPdf(bytes.slice().buffer)
  try {
    const picture = await pagePicture(doc, 1, PICTURE_SIZE, PICTURE_SIZE).catch(
      () => null,
    )
    return { pages: doc.numPages, picture }
  } finally {
    await closePdf(doc)
  }
}

/** The bytes' own buffer, to hand to a worker. */
function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer
    : bytes.slice().buffer
}

/** What to say when the engine itself couldn't be had. */
function engineMessage(kind: OfficeErrorKind) {
  if (kind === 'network') return OFFICE_ERROR_MESSAGES.network
  if (kind === 'memory') {
    return 'The converter needs more memory than this browser could give it. A computer should work.'
  }
  return 'The converter couldn’t start. Reload the page and try again, or try another browser.'
}

function stepLabel({ step, name, index, total }: Working) {
  if (step.step === 'download') return 'Downloading the converter…'
  if (step.step === 'start') return 'Starting the converter…'
  return total > 1
    ? `Converting ${index + 1} of ${total}: ${name}…`
    : `Converting ${name}…`
}

function stepRatio({ step, index, total }: Working) {
  if (step.step === 'download') return step.ratio
  if (step.step === 'convert' && total > 1) return index / total
  return undefined
}

export function OfficeToPdf({ manifest, one, many, kinds, intro }: Props) {
  useTitle(`${manifest.name} · Tuls`)
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  // A problem with the engine itself, rather than with one document.
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<boolean>()
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  // Each conversion run gets a number; cancelling or leaving moves it on,
  // so a run that's no longer wanted stops showing its results.
  const run = useRef(0)
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  const isolated = self.crossOriginIsolated

  // The engine stays running while an Office tool is open.
  useEffect(() => {
    holdEngine()
    const runs = run
    return () => {
      // Leaving stops showing a run's results.
      runs.current++
      releaseEngine()
    }
  }, [])

  useEffect(() => {
    void isEngineSaved().then(setSaved)
  }, [made])

  const handleFiles = useCallback(async (chosen: File[]) => {
    const files = chosen.slice(0, MAX_FILES)
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setError(undefined)
    setFailed([])
    setLeftOut(chosen.length - files.length)
    setAnnouncement('')
    markConverting()
    try {
      for (const [index, file] of files.entries()) {
        // Changed by `show`, so TypeScript mustn't narrow it to 'start'.
        let step = { step: 'start' } as EngineStep
        const show = (next: EngineStep) => {
          step = next
          if (wanted()) {
            setWorking({ step, index, total: files.length, name: file.name })
          }
        }
        show(step)
        const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
        const problem = contentProblem(extensionOf(file.name), head)
        if (problem) {
          problems.push({
            name: file.name,
            message: OFFICE_ERROR_MESSAGES[problem],
          })
          continue
        }
        try {
          const pdf = await convertToPdf(file, show)
          if (!wanted()) return abandon()
          // LibreOffice copies the document's title and author into the
          // PDF, and names itself as its maker.
          const clean = await cleanPdfInBackground(ownBuffer(pdf))
          const { pages, picture } = await describePdf(clean)
          if (!wanted()) return abandon()
          const blob = new Blob([clean.slice()], { type: 'application/pdf' })
          const url = URL.createObjectURL(blob)
          done.push({ name: file.name, blob, url, pages, picture })
        } catch (e) {
          if (!wanted()) return abandon()
          // Handled: the page says what went wrong.
          console.warn(e)
          const kind = officeErrorKind(e)
          // No engine, so no point trying the rest.
          if (step.step !== 'convert') {
            abandon()
            setError(engineMessage(kind))
            return
          }
          problems.push({
            name: file.name,
            message: OFFICE_ERROR_MESSAGES[kind],
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

  function handleCancel() {
    run.current++
    stopEngine()
    markDone()
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
    setFailed([])
    setLeftOut(0)
    setError(undefined)
  }

  const screen = working ? 'working' : made ? 'result' : 'pick'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would be opened by the browser.
  useIgnoreFileDrops(screen !== 'pick')

  const names = made ? pdfNames(made.map((file) => file.name)) : []
  const startOver = { label: `Convert more ${many}`, onClick: handleStartOver }

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
            {intro}
          </p>
          {isolated ? (
            <FileDrop
              what={many}
              hint={`${kinds} · up to ${formatSize(MAX_FILE_SIZE)} each`}
              accept={acceptOf(manifest.accepts)}
              multiple
              check={(file) => checkDocument(file, manifest.accepts, one)}
              onFiles={handleFiles}
            />
          ) : (
            <NotIsolated />
          )}
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
              itself, the device probably ran out of memory: a smaller document,
              or a computer, should work.
            </p>
          )}
          {isolated && (saved === false || phone) && (
            <div className="mt-2 max-w-md space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {saved === false && (
                <p>
                  The converter is a {formatSize(DOWNLOAD_SIZE)} download the
                  first time, then it’s kept on this device.
                </p>
              )}
              {phone && (
                <p>
                  On a phone, documents over {formatSize(PHONE_SIZE)} may be too
                  big to convert.
                </p>
              )}
            </div>
          )}
        </>
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
          {leftOut > 0 && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Up to {MAX_FILES} documents can go in at once, so {leftOut}{' '}
              {leftOut === 1 ? 'was' : 'were'} left out.
            </p>
          )}
          {made.length === 1 ? (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={names[0]}
              downloadLabel="Download PDF"
              details={`${pagesLabel(made[0].pages)} · ${formatSize(made[0].blob.size)}`}
              preview={
                made[0].picture && (
                  <img
                    src={made[0].picture}
                    alt={`The first page of ${names[0]}`}
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
                detail: pagesLabel(file.pages),
              }))}
              start="PDFs"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${made.length} PDFs`}
              label="The PDFs"
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Fonts Tuls doesn’t have are swapped for close matches, so the layout
            can shift a little. Chinese, Japanese and Korean text isn’t
            supported yet.
          </p>
        </>
      )}
    </section>
  )
}

/** For a page that loaded without cross-origin isolation, which LibreOffice needs. */
function NotIsolated() {
  return (
    <div
      role="alert"
      className="mt-10 max-w-md text-sm text-red-600 dark:text-red-400"
    >
      {self.isSecureContext ? (
        <p>
          This page isn’t set up for the converter.{' '}
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>{' '}
          to try again.
        </p>
      ) : (
        <p>The converter only works over a secure (https) connection.</p>
      )}
    </div>
  )
}
