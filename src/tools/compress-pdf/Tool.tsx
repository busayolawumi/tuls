import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ProgressPanel } from '../../components/ProgressPanel'
import { ToolLink } from '../../components/ToolLink'
import { lookAtPdf } from '../../components/pdf/lookAtPdf'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import {
  ACCEPT,
  checkPdf,
  MAX_FILE_SIZE,
  outputNames,
  pagesLabel,
} from '../../engines/pdf/files'
import {
  isLightEngineSaved,
  LIGHT_DOWNLOAD_SIZE,
} from '../../engines/pymupdf/download'
import {
  compressPdf,
  holdEngine,
  releaseEngine,
  stopEngine,
  type EngineStep,
} from '../../engines/pymupdf/engine'
import {
  WORD_ERROR_MESSAGES,
  wordErrorKind,
} from '../../engines/pymupdf/errors'
import type { CompressLevel } from '../../engines/pymupdf/worker'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { manifest as unlockPdf } from '../unlock-pdf/manifest'
import {
  isWorthIt,
  LEVEL_NOTES,
  LEVELS,
  loadLevel,
  MAX_FILES,
  saveLevel,
  savingDetail,
  savingLine,
} from './lib/compress'
import { manifest } from './manifest'

// PDFs in, smaller PDFs out: PyMuPDF, started light (Python and PyMuPDF
// only), with Tuls's own step (engines/pymupdf/tuls_compress.py) shrinking
// the pictures and keeping everything else. Each PDF is looked at first with
// pdf.js, for passwords, damage, signatures and a picture of its first page.
// A copy that isn't at least 5% smaller isn't offered.

const HAS_PASSWORD = 'It has a password. Take it off first with Unlock PDF.'

/** A PDF ready to compress. */
type Item = {
  file: File
  pages: number
  picture: string | null
  signed: boolean
}
/** A smaller copy. */
type Made = Omit<Item, 'file' | 'signed'> & {
  name: string
  before: number
  blob: Blob
  url: string
}
type Checking = { index: number; total: number; name: string }
type Working = { step: EngineStep; index: number; total: number; name: string }

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:compress-pdf:compressing',
)

function stepLabel({ step, index, total, name }: Working) {
  if (step.step === 'download') return 'Downloading the compressor…'
  if (step.step === 'start') return 'Starting the compressor…'
  return total > 1
    ? `Compressing ${index + 1} of ${total}: ${name}…`
    : `Compressing ${name}…`
}

function CompressPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [checking, setChecking] = useState<Checking>()
  const [items, setItems] = useState<Item[]>()
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  // PDFs that didn't get at least 5% smaller, and their sizes.
  const [small, setSmall] = useState<{ name: string; size: number }[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [level, setLevel] = useState<CompressLevel>(() =>
    loadLevel(globalThis.localStorage),
  )
  // A problem with the engine itself, rather than with one PDF.
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<boolean>()
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  // Each run gets a number; cancelling or leaving moves it on, so a run
  // that's no longer wanted stops showing its results.
  const run = useRef(0)

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
    void isLightEngineSaved().then(setSaved)
  }, [made])

  function chooseLevel(value: CompressLevel) {
    setLevel(value)
    saveLevel(globalThis.localStorage, value)
  }

  const handleFiles = useCallback(async (chosen: File[]) => {
    const files = chosen.slice(0, MAX_FILES)
    const id = ++run.current
    const wanted = () => run.current === id
    const ready: Item[] = []
    const problems: Failed[] = []
    setFailed([])
    setSmall([])
    setError(undefined)
    setLeftOut(chosen.length - files.length)
    setAnnouncement('')
    try {
      for (const [index, file] of files.entries()) {
        setChecking({ index, total: files.length, name: file.name })
        try {
          const look = await lookAtPdf(await file.arrayBuffer())
          if (!wanted()) return
          if (look.locked) {
            problems.push({ name: file.name, message: HAS_PASSWORD })
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
      if (wanted()) setChecking(undefined)
    }
    setFailed(problems)
    if (ready.length > 0) setItems(ready)
  }, [])

  async function handleCompress(chosen: CompressLevel = level) {
    if (!items) return
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const tooSmall: { name: string; size: number }[] = []
    const problems: Failed[] = []
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setError(undefined)
    setSmall([])
    markConverting()
    try {
      for (const [index, item] of items.entries()) {
        let step = { step: 'start' } as EngineStep
        const show = (next: EngineStep) => {
          step = next
          if (wanted()) {
            setWorking({
              step,
              index,
              total: items.length,
              name: item.file.name,
            })
          }
        }
        show(step)
        try {
          const pdf = await compressPdf(item.file, chosen, show)
          if (!wanted()) return abandon()
          if (!isWorthIt(item.file.size, pdf.byteLength)) {
            tooSmall.push({ name: item.file.name, size: item.file.size })
            continue
          }
          const blob = new Blob([pdf], { type: 'application/pdf' })
          done.push({
            name: item.file.name,
            before: item.file.size,
            blob,
            url: URL.createObjectURL(blob),
            pages: item.pages,
            picture: item.picture,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          const kind = wordErrorKind(e)
          // No engine, so no point trying the rest.
          if (step.step !== 'compress') {
            abandon()
            setError(
              kind === 'network'
                ? WORD_ERROR_MESSAGES.network
                : 'The compressor couldn’t start. Reload the page and try again, or try another browser.',
            )
            return
          }
          problems.push({
            name: item.file.name,
            message:
              kind === 'password' ? HAS_PASSWORD : WORD_ERROR_MESSAGES[kind],
          })
        }
      }
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
    setFailed(problems)
    setSmall(tooSmall)
    setMade(done)
  }

  /** Straight on to Smallest, with the same PDFs, after Recommended. */
  function handleTrySmallest() {
    chooseLevel('smallest')
    setMade(undefined)
    void handleCompress('smallest')
  }

  function handleCancel() {
    run.current++
    stopEngine()
    markDone()
    setChecking(undefined)
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was compressed.')
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
    setSmall([])
    setLeftOut(0)
    setError(undefined)
  }

  function handleBack() {
    setMade(undefined)
    setFailed([])
    setSmall([])
  }

  const screen = checking
    ? 'checking'
    : working
      ? 'working'
      : made
        ? 'result'
        : items
          ? 'choose'
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
        'compressed',
      )
    : []
  const startOver = { label: 'Compress other PDFs', onClick: handleStartOver }
  const back = { label: 'Try another level', onClick: handleBack }
  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'
  const problems = (failed.length > 0 || leftOut > 0) && (
    <>
      {failed.length > 0 && <FailedList failed={failed} />}
      {failed.some((file) => file.message === HAS_PASSWORD) && (
        <p className="mt-2 w-full max-w-xl text-left text-sm text-zinc-600 dark:text-zinc-400">
          <ToolLink
            tool={unlockPdf}
            className="text-link underline underline-offset-4"
          >
            Unlock PDF
          </ToolLink>{' '}
          takes a password off, if you know it.
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
  // Next to copies that did shrink: the PDFs that didn't, in the same column.
  const smallList = small.length > 0 && (
    <div className="mt-8 w-full text-left">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Already about as small as {small.length > 1 ? 'they get' : 'it gets'},
        so there’s no new copy:
      </p>
      <ul aria-label="PDFs not made smaller" className="mt-2 space-y-1">
        {small.map((file, i) => (
          // Two PDFs can share a name.
          <li
            key={i}
            className="flex items-baseline justify-between gap-3 text-sm"
          >
            <span className="truncate" title={file.name}>
              {file.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {formatSize(file.size)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
  const it = small.length > 1 ? 'them' : 'it'
  const its = small.length > 1 ? 'their' : 'its'
  const totalBefore = made?.reduce((sum, file) => sum + file.before, 0) ?? 0
  const totalAfter = made?.reduce((sum, file) => sum + file.blob.size, 0) ?? 0

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
            Make PDFs smaller, for email and uploads. Photos and scans shrink
            the most.
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
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while compressing. If it closed by
              itself, the device probably ran out of memory: a smaller PDF, or a
              computer, should work.
            </p>
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
          barLabel="Checking"
          onCancel={handleCancel}
        />
      )}

      {screen === 'choose' && items && (
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
                      It’s digitally signed. The signature won’t count in the
                      smaller copy.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {problems}

          <div className="mt-6">
            <fieldset>
              <legend className="sr-only">Size</legend>
              <div className="grid grid-cols-2 gap-2">
                {LEVELS.map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer gap-2.5 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
                  >
                    <input
                      type="radio"
                      name="level"
                      value={value}
                      checked={level === value}
                      onChange={() => chooseLevel(value)}
                      aria-labelledby={`level-${value}`}
                      aria-describedby={`level-${value}-note`}
                      className="mt-0.5 size-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
                    />
                    <span>
                      <span
                        id={`level-${value}`}
                        className="block text-sm font-medium"
                      >
                        {label}
                      </span>
                      <span
                        id={`level-${value}-note`}
                        className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400"
                      >
                        {LEVEL_NOTES[value]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-4 text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleCompress()}
            className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {items.length > 1 ? `Compress ${items.length} PDFs` : 'Compress'}
          </button>
          {(saved === false || phone) && (
            <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {saved === false && (
                <p>
                  The compressor is a {formatSize(LIGHT_DOWNLOAD_SIZE)} download
                  the first time, then it’s kept on this device.
                </p>
              )}
              {phone && (
                <p>
                  On a phone, big PDFs take a while, and very big ones may not
                  fit in its memory.
                </p>
              )}
            </div>
          )}
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

      {screen === 'working' && working && (
        <ProgressPanel
          label={stepLabel(working)}
          ratio={
            working.step.step === 'download'
              ? working.step.ratio
              : working.total > 1
                ? working.index / working.total
                : undefined
          }
          note={
            working.step.step === 'download'
              ? `${formatSize(LIGHT_DOWNLOAD_SIZE)}, only needed the first time.`
              : undefined
          }
          barLabel="Compressing"
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && made && (
        <>
          {failed.length > 0 && <FailedList failed={failed} />}
          {made.length === 0 && small.length > 0 && (
            <div className="mt-8 w-full max-w-sm rounded-lg border border-zinc-200 p-5 text-left dark:border-zinc-800">
              <h2 className="font-medium">
                Already about as small as{' '}
                {small.length > 1 ? 'they get' : 'it gets'}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {level === 'recommended'
                  ? `Recommended couldn’t make ${it} at least 5% smaller. Smallest shrinks ${its} pictures further, so it may.`
                  : `Even Smallest couldn’t make ${it} at least 5% smaller. Most likely ${small.length > 1 ? 'they have' : 'it has'} few pictures, or small ones: text and drawings are compact already.`}
              </p>
              <ul aria-label="The PDFs" className="mt-4 space-y-1">
                {small.map((file, i) => (
                  // Two PDFs can share a name.
                  <li
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {formatSize(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
              {level === 'recommended' && (
                <button
                  type="button"
                  onClick={handleTrySmallest}
                  className="mt-5 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  Try Smallest
                </button>
              )}
            </div>
          )}
          {made.length === 1 && (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={names[0]}
              downloadLabel="Download PDF"
              details={`${pagesLabel(made[0].pages)} · ${savingLine(made[0].before, made[0].blob.size)}`}
              preview={
                made[0].picture && (
                  <img
                    src={made[0].picture}
                    alt={`The first page of ${made[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              after={smallList}
              back={back}
              startOver={startOver}
            />
          )}
          {made.length > 1 && (
            <>
              <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                Together: {savingLine(totalBefore, totalAfter)}
              </p>
              <FilesResult
                files={made.map((file) => ({
                  blob: file.blob,
                  url: file.url,
                  picture: file.picture,
                  detail: savingDetail(file.before, file.blob.size),
                }))}
                start="Compressed PDFs"
                nameOf={(_, i) => names[i]}
                nameField={false}
                count={`${made.length} PDFs`}
                label="The compressed PDFs"
                after={smallList}
                back={back}
                startOver={startOver}
              />
            </>
          )}
          {made.length === 0 && (
            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              <button
                type="button"
                className={textButton}
                onClick={handleStartOver}
              >
                {startOver.label}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default CompressPdf
