import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ProgressPanel } from '../../components/ProgressPanel'
import { ToolLink } from '../../components/ToolLink'
import {
  addTextLayersInBackground,
  hasSignaturesInBackground,
} from '../../engines/pdf/client'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import { ACCEPT, outputNames, pagesLabel } from '../../engines/pdf/files'
import { isSigned } from '../../engines/pdf/names'
import { closePdf, openPdf, pagePicture } from '../../engines/pdf/pdfjs'
import type { TextLayer } from '../../engines/pdf/textLayers'
import { downloadNeeded } from '../../engines/tesseract/download'
import {
  holdEngine,
  readersFor,
  releaseEngine,
  stopEngine,
  type EngineStep,
} from '../../engines/tesseract/engine'
import {
  OCR_ERROR_MESSAGES,
  ocrErrorKind,
} from '../../engines/tesseract/errors'
import { LANGUAGES } from '../../engines/tesseract/languages'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { checkPdfFile } from '../pdf-to-word/lib/files'
import { inspectPdf } from '../pdf-to-word/lib/inspect'
import { manifest as unlockPdf } from '../unlock-pdf/manifest'
import {
  ALREADY_TEXT,
  HAS_PASSWORD,
  loadLanguage,
  MAX_FILES,
  MAX_PAGES,
  MAX_TO_READ,
  MAX_TO_READ_PHONE,
  NOTHING_FOUND,
  outcomeNotes,
  readerCount,
  saveLanguage,
  textOnLabel,
  timeLeft,
  toReadLabel,
  tooManyPages,
  tooManyToRead,
} from './lib/ocr'
import { readPages } from './lib/read'
import { manifest } from './manifest'

/** A PDF with pages to read. */
type Item = {
  file: File
  pages: number
  /** Its pages without text, numbered from 1. */
  scanned: number[]
  picture: string | null
  signed: boolean
}
/** A searchable copy, and what happened to its pages. */
type Made = {
  name: string
  blob: Blob
  url: string
  picture: string | null
  pages: number
  read: number[]
  turned: number[]
  unreadable: number[]
}
type Checking = { index: number; total: number; name: string }
type Working = {
  step: EngineStep | { step: 'write' }
  index: number
  total: number
  name: string
  done: number
  pages: number
  left?: string
}

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:ocr-pdf:reading',
)

function stepLabel({ step, index, total, name, done, pages }: Working) {
  if (step.step === 'download') return 'Downloading the text reader…'
  if (step.step === 'start') return 'Starting the text reader…'
  if (step.step === 'write') return `Adding the text to ${name}…`
  return total > 1
    ? `Reading ${index + 1} of ${total}: ${name}…`
    : `Reading page ${Math.min(done + 1, pages)} of ${pages}…`
}

async function signed(file: File) {
  const data = await file.arrayBuffer()
  return (
    isSigned(new Uint8Array(data)) &&
    (await hasSignaturesInBackground(data).catch(() => false))
  )
}

/** Page 1 of the new copy, when reading turned it the right way up. */
async function firstPage(blob: Blob) {
  const doc = await openPdf(await blob.arrayBuffer())
  try {
    return await pagePicture(doc, 1, 600, 600)
  } finally {
    await closePdf(doc)
  }
}

function OcrPdf() {
  useTitle(`${manifest.name} · Tuls`)
  const [checking, setChecking] = useState<Checking>()
  const [items, setItems] = useState<Item[]>()
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [language, setLanguage] = useState(() =>
    loadLanguage(globalThis.localStorage, navigator.languages ?? []),
  )
  const [needed, setNeeded] = useState<number>()
  const [error, setError] = useState<string>()
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  const run = useRef(0)

  useEffect(() => {
    holdEngine()
    const runs = run
    return () => {
      runs.current++
      releaseEngine()
    }
  }, [])

  useEffect(() => {
    let current = true
    void downloadNeeded(language).then((bytes) => {
      if (current) setNeeded(bytes)
    })
    return () => {
      current = false
    }
  }, [language, made])

  function chooseLanguage(code: string) {
    setLanguage(code)
    saveLanguage(globalThis.localStorage, code)
  }

  const handleFiles = useCallback(
    async (chosen: File[]) => {
      const files = chosen.slice(0, MAX_FILES)
      const id = ++run.current
      const wanted = () => run.current === id
      const ready: Item[] = []
      const problems: Failed[] = []
      const limit = phone ? MAX_TO_READ_PHONE : MAX_TO_READ
      setFailed([])
      setError(undefined)
      setLeftOut(chosen.length - files.length)
      setAnnouncement('')
      try {
        for (const [index, file] of files.entries()) {
          setChecking({ index, total: files.length, name: file.name })
          try {
            const inspected = await inspectPdf(file, MAX_PAGES)
            if (!wanted()) return
            const { pages, scanned } = inspected
            let message: string | undefined
            if (pages > MAX_PAGES) message = tooManyPages(pages)
            else if (scanned.length === 0) message = ALREADY_TEXT
            else if (scanned.length > limit) {
              message = tooManyToRead(scanned.length, phone)
            }
            if (message) {
              problems.push({ name: file.name, message })
              continue
            }
            ready.push({ file, ...inspected, signed: await signed(file) })
            if (!wanted()) return
          } catch (e) {
            if (!wanted()) return
            console.warn(e)
            const kind = pdfErrorKind(e)
            problems.push({
              name: file.name,
              message:
                kind === 'password' ? HAS_PASSWORD : PDF_ERROR_MESSAGES[kind],
            })
          }
        }
      } finally {
        if (wanted()) setChecking(undefined)
      }
      setFailed(problems)
      if (ready.length > 0) setItems(ready)
    },
    [phone],
  )

  async function handleRead() {
    if (!items) return
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const pages = items.reduce((sum, item) => sum + item.scanned.length, 0)
    let finished = 0
    let began: number | undefined
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setError(undefined)
    markConverting()
    try {
      for (const [index, item] of items.entries()) {
        let step = { step: 'start' } as Working['step']
        const show = (next: Working['step']) => {
          step = next
          if (!wanted()) return
          setWorking({
            step,
            index,
            total: items.length,
            name: item.file.name,
            done: finished,
            pages,
            left:
              began === undefined
                ? undefined
                : timeLeft(finished, pages, performance.now() - began),
          })
        }
        show(step)
        try {
          const readers = await readersFor(
            language,
            readerCount(
              item.scanned.length,
              phone,
              navigator.hardwareConcurrency,
            ),
            show,
          )
          began ??= performance.now()
          show({ step: 'read' })
          const outcomes = await readPages(
            await item.file.arrayBuffer(),
            item.scanned,
            readers,
            () => {
              finished++
              show({ step: 'read' })
            },
          )
          if (!wanted()) return abandon()
          const layers = outcomes.filter(
            (outcome): outcome is TextLayer => outcome.layer !== undefined,
          )
          if (layers.length === 0) {
            problems.push({ name: item.file.name, message: NOTHING_FOUND })
            continue
          }
          show({ step: 'write' })
          const pdf = await addTextLayersInBackground(
            await item.file.arrayBuffer(),
            layers,
          )
          if (!wanted()) return abandon()
          const blob = new Blob([pdf], { type: 'application/pdf' })
          const turned = layers
            .filter((layer) => layer.turn)
            .map((layer) => layer.page)
          done.push({
            name: item.file.name,
            blob,
            url: URL.createObjectURL(blob),
            picture: turned.includes(1)
              ? await firstPage(blob).catch(() => item.picture)
              : item.picture,
            pages: item.pages,
            read: layers.map((layer) => layer.page),
            turned,
            unreadable: outcomes
              .filter((outcome) => !outcome.layer)
              .map((outcome) => outcome.page),
          })
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          if (step.step === 'write') {
            problems.push({
              name: item.file.name,
              message: PDF_ERROR_MESSAGES[pdfErrorKind(e)],
            })
            continue
          }
          const kind = ocrErrorKind(e)
          // No reader, so no point trying the rest.
          if (step.step !== 'read') {
            abandon()
            setError(
              kind === 'network'
                ? OCR_ERROR_MESSAGES.network
                : 'The text reader couldn’t start. Reload the page and try again, or try another browser.',
            )
            return
          }
          // A stuck or crashed reader is no use for the next PDF.
          stopEngine()
          problems.push({
            name: item.file.name,
            message: OCR_ERROR_MESSAGES[kind],
          })
        }
      }
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
    setFailed(problems)
    setMade(done)
  }

  function handleCancel() {
    run.current++
    stopEngine()
    markDone()
    setChecking(undefined)
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was read.')
  }

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

  function handleBack() {
    setMade(undefined)
    setFailed([])
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
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])
  useIgnoreFileDrops(screen !== 'pick')

  const names = made
    ? outputNames(
        made.map((file) => file.name),
        'searchable',
      )
    : []
  const startOver = { label: 'Read other PDFs', onClick: handleStartOver }
  const back = { label: 'Choose another language', onClick: handleBack }
  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'
  const note = 'text-sm text-zinc-600 dark:text-zinc-400'
  const problems = (failed.length > 0 || leftOut > 0) && (
    <>
      {failed.length > 0 && <FailedList failed={failed} />}
      {failed.some((file) => file.message === HAS_PASSWORD) && (
        <p className={`mt-2 w-full max-w-xl text-left ${note}`}>
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
        <p className={`mt-2 w-full max-w-xl text-left ${note}`}>
          Up to {MAX_FILES} PDFs can go in at once, so {leftOut}{' '}
          {leftOut === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </>
  )
  const caution = (
    <p className="mt-6 w-full text-center text-xs text-zinc-500 dark:text-zinc-400">
      Text recognition can misread small or blurry print, so check names and
      numbers that matter.
    </p>
  )
  const languageName =
    LANGUAGES.find((entry) => entry.code === language)?.name ?? 'English'

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
            Make scanned PDFs searchable. Tuls reads the text in their pages, so
            you can search, select and copy it.
          </p>
          <FileDrop
            what="PDFs"
            hint="PDF · up to 100 MB each"
            accept={ACCEPT}
            multiple
            check={checkPdfFile}
            onFiles={handleFiles}
          />
          {problems}
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while reading. If it closed by itself,
              the device probably ran out of memory: fewer pages, or a computer,
              should work.
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
                    {toReadLabel(item.pages, item.scanned.length)}
                  </p>
                  {item.signed && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      It’s digitally signed. The signature won’t count in the
                      searchable copy.
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {problems}

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">
              Language of the text
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {LANGUAGES.map((entry) => (
                <label
                  key={entry.code}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-2 text-sm transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
                >
                  <input
                    type="radio"
                    name="language"
                    value={entry.code}
                    checked={language === entry.code}
                    onChange={() => chooseLanguage(entry.code)}
                    className="size-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
                  />
                  {entry.name}
                </label>
              ))}
            </div>
          </fieldset>
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
            onClick={() => void handleRead()}
            className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {items.length > 1
              ? `Make ${items.length} PDFs searchable`
              : 'Make searchable'}
          </button>
          <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <p>
              Reading takes a few seconds a page
              {phone ? ', and longer on a phone' : ''}.
            </p>
            {needed !== undefined && needed > 0 && (
              <p>
                The text reader for {languageName} is a {formatSize(needed)}{' '}
                download the first time, then it’s kept on this device.
              </p>
            )}
          </div>
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
              : working.step.step === 'start'
                ? undefined
                : working.done / working.pages
          }
          note={
            working.step.step === 'download'
              ? needed
                ? `${formatSize(needed)}, only needed the first time.`
                : undefined
              : working.step.step === 'read'
                ? working.left
                : undefined
          }
          barLabel="Reading"
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && made && (
        <>
          {made.length === 0 && (
            <>
              {failed.length > 0 && <FailedList failed={failed} />}
              <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
                <button
                  type="button"
                  className={textButton}
                  onClick={handleBack}
                >
                  {back.label}
                </button>
                <span aria-hidden="true" className="mx-2">
                  ·
                </span>
                <button
                  type="button"
                  className={textButton}
                  onClick={handleStartOver}
                >
                  {startOver.label}
                </button>
              </p>
            </>
          )}
          {made.length === 1 && (
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
              after={
                <div className="mt-8 w-full text-center">
                  {failed.length > 0 && <FailedList failed={failed} />}
                  <ul
                    aria-label="What was read"
                    className={`space-y-1 ${note}`}
                  >
                    {outcomeNotes(made[0]).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {caution}
                </div>
              }
              back={back}
              startOver={startOver}
            />
          )}
          {made.length > 1 && (
            <FilesResult
              files={made.map((file) => ({
                blob: file.blob,
                url: file.url,
                picture: file.picture,
                detail: textOnLabel(file.read.length, file.pages),
              }))}
              start="Searchable PDFs"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${made.length} PDFs`}
              label="The searchable PDFs"
              after={
                <div className="mt-8 w-full text-center">
                  {failed.length > 0 && <FailedList failed={failed} />}
                  {made.some((file) => file.turned.length > 0) && (
                    <p className={note}>
                      Sideways or upside-down pages were turned the right way
                      up.
                    </p>
                  )}
                  {caution}
                </div>
              }
              back={back}
              startOver={startOver}
            />
          )}
        </>
      )}
    </section>
  )
}

export default OcrPdf
