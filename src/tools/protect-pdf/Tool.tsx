import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { NewPasswordForm } from '../../components/NewPasswordForm'
import { ProgressPanel } from '../../components/ProgressPanel'
import { ToolLink } from '../../components/ToolLink'
import { lookAtPdf } from '../../components/pdf/lookAtPdf'
import { protectPdfInBackground } from '../../engines/pdf/client'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import {
  ACCEPT,
  checkPdf,
  MAX_FILE_SIZE,
  outputNames,
  pagesLabel,
} from '../../engines/pdf/files'
import { formatSize } from '../../lib/format'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { manifest as unlockPdf } from '../unlock-pdf/manifest'
import { manifest } from './manifest'

// PDFs in, the same PDFs with a password out (qpdf, AES-256: see
// engines/pdf/passwords.ts). Each PDF is looked at first with pdf.js, for
// PDFs that already have a password, damaged ones, signatures and a picture
// of the first page. One password goes on all of them.

const MAX_FILES = 20
const ALREADY_LOCKED =
  'It already has a password. To change it, use Unlock PDF.'

/** A PDF ready to protect. */
type Item = {
  file: File
  pages: number
  picture: string | null
  signed: boolean
}
/** A protected PDF. */
type Made = Omit<Item, 'signed' | 'file'> & {
  name: string
  blob: Blob
  url: string
}
type Progress = {
  verb: 'Checking' | 'Protecting'
  index: number
  total: number
  name: string
}

function ProtectPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [progress, setProgress] = useState<Progress>()
  const [items, setItems] = useState<Item[]>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  // Couldn't protect any of them.
  const [error, setError] = useState<string>()
  const [announcement, setAnnouncement] = useState('')
  // Each run gets a number; cancelling or leaving moves it on, so a run
  // that's no longer wanted stops showing its results.
  const run = useRef(0)

  useEffect(() => {
    const runs = run
    return () => {
      runs.current++
    }
  }, [])

  const handleFiles = useCallback(async (chosen: File[]) => {
    const files = chosen.slice(0, MAX_FILES)
    const id = ++run.current
    const wanted = () => run.current === id
    const ready: Item[] = []
    const problems: Failed[] = []
    setFailed([])
    setError(undefined)
    setLeftOut(chosen.length - files.length)
    setAnnouncement('')
    try {
      for (const [index, file] of files.entries()) {
        setProgress({
          verb: 'Checking',
          index,
          total: files.length,
          name: file.name,
        })
        try {
          const look = await lookAtPdf(await file.arrayBuffer())
          if (!wanted()) return
          if (look.locked) {
            problems.push({ name: file.name, message: ALREADY_LOCKED })
          } else {
            ready.push({ file, ...look })
          }
        } catch (e) {
          if (!wanted()) return
          // Handled: the page says what went wrong.
          console.warn(e)
          problems.push({
            name: file.name,
            message: PDF_ERROR_MESSAGES[pdfErrorKind(e)],
          })
        }
      }
    } finally {
      if (wanted()) setProgress(undefined)
    }
    setFailed(problems)
    if (ready.length > 0) setItems(ready)
  }, [])

  async function handleProtect(password: string) {
    if (!items) return
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setError(undefined)
    try {
      for (const [index, item] of items.entries()) {
        setProgress({
          verb: 'Protecting',
          index,
          total: items.length,
          name: item.file.name,
        })
        try {
          const bytes = await protectPdfInBackground(
            await item.file.arrayBuffer(),
            password,
          )
          if (!wanted()) return abandon()
          const blob = new Blob([new Uint8Array(bytes)], {
            type: 'application/pdf',
          })
          done.push({
            name: item.file.name,
            blob,
            url: URL.createObjectURL(blob),
            pages: item.pages,
            picture: item.picture,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          const kind = pdfErrorKind(e)
          problems.push({
            name: item.file.name,
            message:
              kind === 'password' ? ALREADY_LOCKED : PDF_ERROR_MESSAGES[kind],
          })
        }
      }
    } finally {
      if (wanted()) setProgress(undefined)
    }
    setFailed(problems)
    if (done.length === 0) {
      setError('The password couldn’t be added. Try again, or reload the page.')
      return
    }
    setMade(done)
  }

  function handleCancel() {
    run.current++
    setProgress(undefined)
    setAnnouncement('Stopped.')
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
    setItems(undefined)
    setFailed([])
    setLeftOut(0)
    setError(undefined)
  }

  const screen = progress
    ? 'working'
    : made
      ? 'result'
      : items
        ? 'password'
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
        'protected',
      )
    : []
  const startOver = { label: 'Protect other PDFs', onClick: handleStartOver }
  const back = {
    label: 'Change the password',
    onClick: () => setMade(undefined),
  }
  const problems = failed.length > 0 && (
    <>
      <FailedList failed={failed} />
      {failed.some((file) => file.message === ALREADY_LOCKED) && (
        <p className="mt-2 w-full max-w-xl text-left text-sm text-zinc-600 dark:text-zinc-400">
          <ToolLink
            tool={unlockPdf}
            className="text-link underline underline-offset-4"
          >
            Unlock PDF
          </ToolLink>{' '}
          takes a password off, or changes it, if you know it.
        </p>
      )}
      {leftOut > 0 && (
        <p className="mt-2 w-full max-w-xl text-left text-sm text-zinc-600 dark:text-zinc-400">
          Up to {MAX_FILES} PDFs can go in at once, so {leftOut}{' '}
          {leftOut === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </>
  )
  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'

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
            Add a password to PDFs, so only people who have it can open them.
          </p>
          <FileDrop
            what="PDFs"
            hint={`PDF · up to ${formatSize(MAX_FILE_SIZE)} each`}
            accept={ACCEPT}
            multiple
            check={checkPdf}
            onFiles={handleFiles}
          />
          {problems}
        </>
      )}

      {screen === 'working' && progress && (
        <ProgressPanel
          label={
            progress.total > 1
              ? `${progress.verb} ${progress.index + 1} of ${progress.total}: ${progress.name}…`
              : `${progress.verb} ${progress.name}…`
          }
          ratio={
            progress.total > 1 ? progress.index / progress.total : undefined
          }
          barLabel={progress.verb}
          onCancel={handleCancel}
        />
      )}

      {screen === 'password' && items && (
        <div className="mt-6 w-full max-w-sm text-left sm:mt-8">
          <ul aria-label="The PDFs" className="flex flex-col gap-2">
            {items.map((item, i) => (
              // Two PDFs can share a name.
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center">
                  {item.picture ? (
                    <img
                      src={item.picture}
                      alt=""
                      className="max-h-full max-w-full rounded-sm border border-zinc-200 dark:border-zinc-800"
                    />
                  ) : (
                    <span className="h-14 w-10 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    title={item.file.name}
                  >
                    {item.file.name}
                  </p>
                  <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {pagesLabel(item.pages)} · {formatSize(item.file.size)}
                  </p>
                  {item.signed && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      It’s digitally signed. The signature won’t count once it
                      has a password.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {problems}

          <NewPasswordForm
            count={items.length}
            error={error}
            onSubmit={(password) => void handleProtect(password)}
          />
          <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              className={textButton}
              onClick={handleStartOver}
            >
              Choose other PDFs
            </button>
          </p>
        </div>
      )}

      {screen === 'result' && made && (
        <>
          {failed.length > 0 && <FailedList failed={failed} />}
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
                    alt={`The first page of ${made[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              back={back}
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
              start="Protected PDFs"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${made.length} PDFs`}
              label="The protected PDFs"
              back={back}
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Keep the password somewhere safe. Nobody can open{' '}
            {made.length > 1 ? 'these PDFs' : 'this PDF'} without it, Tuls
            included.
          </p>
        </>
      )}
    </section>
  )
}

export default ProtectPdf
