import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { NewPasswordForm } from '../../components/NewPasswordForm'
import { PasswordInput, ShowPassword } from '../../components/PasswordInput'
import { ProgressPanel } from '../../components/ProgressPanel'
import { lookAtPdf } from '../../components/pdf/lookAtPdf'
import {
  protectPdfInBackground,
  unlockPdfInBackground,
} from '../../engines/pdf/client'
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
import { NO_PASSWORD, wrongPassword } from './lib/messages'
import { manifest } from './manifest'

// PDFs with a password in, the same PDFs without it out (qpdf: see
// engines/pdf/passwords.ts). Each is looked at first with pdf.js: one that
// opens without a password has nothing to take off, which also covers PDFs
// locked only against changes (Tuls doesn't offer to unlock those; CLAUDE.md,
// "Locked PDFs"). One password is tried on all of them; the ones it doesn't
// open stay, to try another. Unlocked PDFs can then be given a new password
// (as Protect PDF does) before they're saved: changing a password in one go.

const MAX_FILES = 20

/** An unlocked PDF. */
type Made = {
  name: string
  blob: Blob
  url: string
  pages: number
  picture: string | null
}
type Progress = {
  verb: 'Checking' | 'Unlocking' | 'Protecting'
  index: number
  total: number
  name: string
}

function UnlockPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [progress, setProgress] = useState<Progress>()
  // The PDFs still locked, once some are chosen.
  const [locked, setLocked] = useState<File[]>()
  const [unlocked, setUnlocked] = useState<Made[]>([])
  const [finished, setFinished] = useState(false)
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [problem, setProblem] = useState<string>()
  const [announcement, setAnnouncement] = useState('')
  // Giving the unlocked PDFs a new password: choosing it, then the result.
  const [choosingNew, setChoosingNew] = useState(false)
  const [relocked, setRelocked] = useState<Made[]>()
  const [relockError, setRelockError] = useState<string>()
  const passwordBox = useRef<HTMLInputElement>(null)
  // Counts wrong passwords, so the box is chosen again after each.
  const [triedAgain, setTriedAgain] = useState(0)
  const problemId = useId()
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
    const ready: File[] = []
    const problems: Failed[] = []
    setFailed([])
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
          if (look.locked) ready.push(file)
          else problems.push({ name: file.name, message: NO_PASSWORD })
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
    if (ready.length > 0) setLocked(ready)
  }, [])

  async function handleUnlock(event: FormEvent) {
    event.preventDefault()
    if (!locked) return
    if (password === '') {
      setProblem('Type the password.')
      passwordBox.current?.focus()
      return
    }
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const stillLocked: File[] = []
    const problems: Failed[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setProblem(undefined)
    try {
      for (const [index, file] of locked.entries()) {
        setProgress({
          verb: 'Unlocking',
          index,
          total: locked.length,
          name: file.name,
        })
        try {
          const bytes = await unlockPdfInBackground(
            await file.arrayBuffer(),
            password,
          )
          const blob = new Blob([new Uint8Array(bytes)], {
            type: 'application/pdf',
          })
          // Now it opens, for its page count and a picture.
          const look = await lookAtPdf(await blob.arrayBuffer())
          if (!wanted()) return abandon()
          done.push({
            name: file.name,
            blob,
            url: URL.createObjectURL(blob),
            pages: look.locked ? 0 : look.pages,
            picture: look.locked ? null : look.picture,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          const kind = pdfErrorKind(e)
          if (kind === 'password') {
            stillLocked.push(file)
          } else {
            console.warn(e)
            problems.push({
              name: file.name,
              message: PDF_ERROR_MESSAGES[kind],
            })
          }
        }
      }
    } finally {
      if (wanted()) setProgress(undefined)
    }
    const all = [...unlocked, ...done]
    setUnlocked(all)
    setFailed((before) => [...before, ...problems])
    if (stillLocked.length > 0) {
      setLocked(stillLocked)
      setProblem(wrongPassword(stillLocked.length, locked.length))
      setTriedAgain((count) => count + 1)
      return
    }
    setLocked(undefined)
    setPassword('')
    setShown(false)
    if (all.length > 0) setFinished(true)
  }

  async function handleNewPassword(password: string) {
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setRelockError(undefined)
    try {
      for (const [index, file] of unlocked.entries()) {
        setProgress({
          verb: 'Protecting',
          index,
          total: unlocked.length,
          name: file.name,
        })
        try {
          const bytes = await protectPdfInBackground(
            await file.blob.arrayBuffer(),
            password,
          )
          if (!wanted()) return abandon()
          const blob = new Blob([new Uint8Array(bytes)], {
            type: 'application/pdf',
          })
          done.push({ ...file, blob, url: URL.createObjectURL(blob) })
        } catch (e) {
          if (!wanted()) return abandon()
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
    if (done.length === 0) {
      setRelockError(
        'The new password couldn’t be added. Try again, or reload the page.',
      )
      return
    }
    setFailed((before) => [...before, ...problems])
    setChoosingNew(false)
    setRelocked(done)
  }

  // The new copies' addresses are let go along with them.
  useEffect(() => {
    if (!relocked) return
    return () => {
      for (const file of relocked) URL.revokeObjectURL(file.url)
    }
  }, [relocked])

  // Back on the password screen after a wrong password: straight to the
  // box, with what was typed chosen, to fix or replace it. After React has
  // put the box back, which a frame's wait didn't always manage in Firefox.
  useEffect(() => {
    if (triedAgain > 0) passwordBox.current?.select()
  }, [triedAgain])

  function handleCancel() {
    run.current++
    setProgress(undefined)
    setAnnouncement('Stopped.')
  }

  // The files' addresses are let go when the result goes.
  useEffect(() => {
    if (!finished) return
    return () => {
      for (const file of unlocked) URL.revokeObjectURL(file.url)
    }
  }, [finished, unlocked])

  function handleStartOver() {
    // Unlocked PDFs not shown yet (none, or before "Carry on") go too.
    if (!finished) for (const file of unlocked) URL.revokeObjectURL(file.url)
    setFinished(false)
    setChoosingNew(false)
    setRelocked(undefined)
    setRelockError(undefined)
    setLocked(undefined)
    setUnlocked([])
    setFailed([])
    setLeftOut(0)
    setPassword('')
    setShown(false)
    setProblem(undefined)
  }

  function handleCarryOn() {
    setLocked(undefined)
    setPassword('')
    setShown(false)
    setProblem(undefined)
    setFinished(true)
  }

  const screen = progress
    ? 'working'
    : relocked
      ? 'relocked'
      : choosingNew
        ? 'new-password'
        : finished
          ? 'result'
          : locked
            ? 'password'
            : 'pick'
  // Each screen starts at the top, as in the other tools.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])
  // Past the first screen there's no drop zone, so a file dropped by mistake
  // would be opened by the browser.
  useIgnoreFileDrops(screen !== 'pick')

  const names = outputNames(
    unlocked.map((file) => file.name),
    'unlocked',
  )
  const newNames = relocked
    ? outputNames(
        relocked.map((file) => file.name),
        'protected',
      )
    : []
  const startOver = { label: 'Unlock other PDFs', onClick: handleStartOver }
  const it = unlocked.length > 1 ? 'them' : 'it'
  const newPassword = (
    <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
      Or{' '}
      <button
        type="button"
        onClick={() => setChoosingNew(true)}
        className="text-link underline underline-offset-4"
      >
        give {it} a new password
      </button>{' '}
      before saving.
    </p>
  )
  const problems = (failed.length > 0 || leftOut > 0) && (
    <>
      {failed.length > 0 && <FailedList failed={failed} />}
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
            Take the password off PDFs, or change it. You’ll need the password
            they have now.
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

      {screen === 'password' && locked && (
        <div className="mt-6 w-full max-w-sm text-left sm:mt-8">
          {unlocked.length > 0 && (
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              {unlocked.length === 1
                ? '1 PDF is unlocked.'
                : `${unlocked.length} PDFs are unlocked.`}{' '}
              {locked.length === 1 ? 'This one is' : 'These are'} still locked:
            </p>
          )}
          <ul aria-label="The locked PDFs" className="flex flex-col gap-2">
            {locked.map((file, i) => (
              // Two PDFs can share a name.
              <li
                key={i}
                className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <p className="truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </p>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {formatSize(file.size)}
                </p>
              </li>
            ))}
          </ul>
          {problems}

          <form onSubmit={handleUnlock} noValidate className="mt-4">
            <PasswordInput
              ref={passwordBox}
              label="Password"
              value={password}
              onChange={(value) => {
                setPassword(value)
                setProblem(undefined)
              }}
              shown={shown}
              describedBy={problem ? problemId : undefined}
              invalid={problem !== undefined}
            />
            <ShowPassword shown={shown} onChange={setShown} />
            {problem && (
              <p
                id={problemId}
                role="alert"
                className="mt-3 text-sm text-red-600 dark:text-red-400"
              >
                {problem}
              </p>
            )}
            <button
              type="submit"
              className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {locked.length > 1 ? `Unlock ${locked.length} PDFs` : 'Unlock'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {unlocked.length > 0 && (
              <>
                <button
                  type="button"
                  className={textButton}
                  onClick={handleCarryOn}
                >
                  Carry on without {locked.length === 1 ? 'it' : 'them'}
                </button>
                {' · '}
              </>
            )}
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

      {screen === 'result' && (
        <>
          {problems}
          {unlocked.length === 1 ? (
            <FileResult
              blob={unlocked[0].blob}
              url={unlocked[0].url}
              name={names[0]}
              downloadLabel="Download PDF"
              details={`${pagesLabel(unlocked[0].pages)} · ${formatSize(unlocked[0].blob.size)}`}
              preview={
                unlocked[0].picture && (
                  <img
                    src={unlocked[0].picture}
                    alt={`The first page of ${unlocked[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              more={newPassword}
              startOver={startOver}
            />
          ) : (
            <FilesResult
              files={unlocked.map((file) => ({
                blob: file.blob,
                url: file.url,
                picture: file.picture,
                detail: pagesLabel(file.pages),
              }))}
              start="Unlocked PDFs"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${unlocked.length} PDFs`}
              label="The unlocked PDFs"
              more={newPassword}
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            {unlocked.length > 1 ? 'These copies open' : 'This copy opens'}{' '}
            without a password. The{' '}
            {unlocked.length > 1
              ? 'originals still have theirs'
              : 'original still has it'}
            .
          </p>
        </>
      )}

      {screen === 'new-password' && (
        <div className="mt-6 w-full max-w-sm text-left sm:mt-8">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            A new password for{' '}
            {unlocked.length > 1
              ? `the ${unlocked.length} unlocked PDFs`
              : unlocked[0].name}
            . You’ll download {it} with the new password, ready to send.
          </p>
          <NewPasswordForm
            count={unlocked.length}
            error={relockError}
            onSubmit={(password) => void handleNewPassword(password)}
          />
          <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button
              type="button"
              className={textButton}
              onClick={() => {
                setChoosingNew(false)
                setRelockError(undefined)
              }}
            >
              Back without a new password
            </button>
          </p>
        </div>
      )}

      {screen === 'relocked' && relocked && (
        <>
          {problems}
          {relocked.length === 1 ? (
            <FileResult
              blob={relocked[0].blob}
              url={relocked[0].url}
              name={newNames[0]}
              downloadLabel="Download PDF"
              details={`${pagesLabel(relocked[0].pages)} · ${formatSize(relocked[0].blob.size)}`}
              preview={
                relocked[0].picture && (
                  <img
                    src={relocked[0].picture}
                    alt={`The first page of ${relocked[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              back={{
                label: 'Choose another password',
                onClick: () => {
                  setRelocked(undefined)
                  setChoosingNew(true)
                },
              }}
              startOver={startOver}
            />
          ) : (
            <FilesResult
              files={relocked.map((file) => ({
                blob: file.blob,
                url: file.url,
                picture: file.picture,
                detail: pagesLabel(file.pages),
              }))}
              start="Protected PDFs"
              nameOf={(_, i) => newNames[i]}
              nameField={false}
              count={`${relocked.length} PDFs`}
              label="The PDFs with a new password"
              back={{
                label: 'Choose another password',
                onClick: () => {
                  setRelocked(undefined)
                  setChoosingNew(true)
                },
              }}
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Keep the new password somewhere safe. Nobody can open{' '}
            {relocked.length > 1 ? 'these PDFs' : 'this PDF'} without it, Tuls
            included.
          </p>
        </>
      )}
    </section>
  )
}

export default UnlockPdf
