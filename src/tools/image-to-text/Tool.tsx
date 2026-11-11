import { useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { ImageList } from '../../components/images/ImageList'
import { ProgressPanel } from '../../components/ProgressPanel'
import { stopHeif } from '../../engines/heif/client'
import { stopImages } from '../../engines/images/client'
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
import { download } from '../../lib/download'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { ACCEPT, checkImage, MAX_IMAGE_SIZE } from '../images-to-pdf/lib/images'
import {
  loadLanguage,
  readerCount,
  saveLanguage,
  timeLeft,
} from '../ocr-pdf/lib/ocr'
import { readImages } from './lib/read'
import {
  allText,
  MAX_IMAGES,
  CANT_READ,
  NO_TEXT,
  textFileName,
  wordsLabel,
  type ImageText,
} from './lib/text'
import { manifest } from './manifest'

type Working = {
  step: EngineStep
  done: number
  total: number
  left?: string
}
type Result = {
  read: (ImageText & { unreadable?: boolean })[]
  turned: boolean
}

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:image-to-text:reading',
)

function stepLabel({ step, done, total }: Working) {
  if (step.step === 'download') return 'Downloading the text reader…'
  if (step.step === 'start') return 'Starting the text reader…'
  return total > 1
    ? `Reading image ${Math.min(done + 1, total)} of ${total}…`
    : 'Reading the image…'
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyButton({
  text,
  label,
  onCopied,
}: {
  text: string
  label: string
  onCopied: (copied: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(text).then((ok) => {
          setCopied(ok)
          onCopied(ok)
        })
      }
      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

function ImageToText() {
  useTitle(`${manifest.name} · Tuls`)
  const [files, setFiles] = useState<File[]>()
  const [leftOut, setLeftOut] = useState(0)
  const [working, setWorking] = useState<Working>()
  const [result, setResult] = useState<Result>()
  const [failed, setFailed] = useState<Failed[]>([])
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
  }, [language, result])

  function chooseLanguage(code: string) {
    setLanguage(code)
    saveLanguage(globalThis.localStorage, code)
  }

  function handleFiles(chosen: File[]) {
    setFiles(chosen.slice(0, MAX_IMAGES))
    setLeftOut(Math.max(0, chosen.length - MAX_IMAGES))
    setFailed([])
    setError(undefined)
  }

  async function handleRead() {
    if (!files) return
    const id = ++run.current
    const wanted = () => run.current === id
    const total = files.length
    let done = 0
    let began: number | undefined
    let step = { step: 'start' } as EngineStep
    const show = (next: EngineStep) => {
      step = next
      if (!wanted()) return
      setWorking({
        step,
        done,
        total,
        left:
          began === undefined
            ? undefined
            : timeLeft(done, total, performance.now() - began),
      })
    }
    setError(undefined)
    markConverting()
    show(step)
    try {
      const readers = await readersFor(
        language,
        readerCount(total, phone, navigator.hardwareConcurrency),
        show,
      )
      began = performance.now()
      show({ step: 'read' })
      const outcomes = await readImages(files, readers, () => {
        done++
        show({ step: 'read' })
      })
      if (!wanted()) return
      const problems: Failed[] = []
      const read: Result['read'] = []
      let turned = false
      outcomes.forEach((outcome, i) => {
        if ('error' in outcome) {
          problems.push({
            name: files[i].name,
            message: 'Tuls can’t open this image.',
          })
        } else {
          read.push({
            name: files[i].name,
            text: outcome.text,
            unreadable: outcome.unreadable,
          })
          turned ||= outcome.turned
        }
      })
      setFailed(problems)
      setResult({ read, turned })
    } catch (e) {
      if (!wanted()) return
      console.warn(e)
      stopEngine()
      const kind = ocrErrorKind(e)
      setError(
        step.step === 'read'
          ? OCR_ERROR_MESSAGES[kind]
          : kind === 'network'
            ? OCR_ERROR_MESSAGES.network
            : 'The text reader couldn’t start. Reload the page and try again, or try another browser.',
      )
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
  }

  function handleCancel() {
    run.current++
    stopEngine()
    stopHeif()
    stopImages()
    markDone()
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was read.')
  }

  function handleStartOver() {
    setResult(undefined)
    setFiles(undefined)
    setFailed([])
    setLeftOut(0)
    setError(undefined)
  }

  function handleBack() {
    setResult(undefined)
    setFailed([])
  }

  const copied = (ok: boolean) =>
    setAnnouncement(
      ok ? 'Copied.' : 'Couldn’t copy. Select the text and copy it instead.',
    )

  const screen = working
    ? 'working'
    : result
      ? 'result'
      : files
        ? 'choose'
        : 'pick'
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])
  useIgnoreFileDrops(screen !== 'pick')

  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'
  const primary =
    'rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'
  const languageName =
    LANGUAGES.find((entry) => entry.code === language)?.name ?? 'English'
  const found = result?.read.filter((entry) => entry.text) ?? []
  const everything = result ? allText(result.read) : ''

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
            Copy the text out of photos and screenshots. Tuls reads it on your
            device, so you can paste it anywhere.
          </p>
          <FileDrop
            what="images"
            hint={`HEIC, JPG, PNG, WebP, AVIF or GIF · up to ${MAX_IMAGES}, ${formatSize(MAX_IMAGE_SIZE)} each`}
            accept={ACCEPT}
            multiple
            check={checkImage}
            onFiles={handleFiles}
          />
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while reading. If it closed by itself,
              the device probably ran out of memory: fewer images, or a
              computer, should work.
            </p>
          )}
        </>
      )}

      {screen === 'choose' && files && (
        <div className="mt-6 w-full max-w-sm text-left sm:mt-8">
          <ImageList files={files} leftOut={leftOut} most={MAX_IMAGES} />
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
            className={`mt-6 w-full ${primary}`}
          >
            {files.length > 1 ? `Read ${files.length} images` : 'Read text'}
          </button>
          <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <p>
              Reading takes a few seconds an image
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
              Choose other images
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
                : working.done / working.total
          }
          note={
            working.step.step === 'download'
              ? needed
                ? `${formatSize(needed)}, only needed the first time.`
                : undefined
              : working.left
          }
          barLabel="Reading"
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && result && (
        <div className="mt-6 w-full max-w-xl text-left sm:mt-8">
          {found.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <CopyButton
                text={everything}
                label={result.read.length > 1 ? 'Copy all' : 'Copy text'}
                onCopied={copied}
              />
              <button
                type="button"
                className={primary}
                onClick={() =>
                  download(
                    new Blob([everything], {
                      type: 'text/plain;charset=utf-8',
                    }),
                    textFileName(result.read.map((entry) => entry.name)),
                  )
                }
              >
                Save as .txt
              </button>
            </div>
          )}
          <ul aria-label="The text" className="mt-6 space-y-4">
            {result.read.map((entry, i) => (
              // Two images can share a name.
              <li key={i}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium"
                      title={entry.name}
                    >
                      {entry.name}
                    </p>
                    <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {entry.text
                        ? wordsLabel(entry.text)
                        : entry.unreadable
                          ? 'Too hard to read'
                          : NO_TEXT}
                    </p>
                    {entry.unreadable && (
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        {CANT_READ}
                      </p>
                    )}
                  </div>
                  {entry.text && result.read.length > 1 && (
                    <CopyButton
                      text={entry.text}
                      label="Copy"
                      onCopied={copied}
                    />
                  )}
                </div>
                {entry.text && (
                  <textarea
                    readOnly
                    value={entry.text}
                    aria-label={`Text from ${entry.name}`}
                    rows={Math.min(
                      12,
                      Math.max(3, entry.text.split('\n').length),
                    )}
                    className="mt-2 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-base leading-relaxed sm:text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  />
                )}
              </li>
            ))}
          </ul>
          {failed.length > 0 && <FailedList failed={failed} />}
          {result.turned && (
            <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
              Sideways or upside-down images were read the right way up.
            </p>
          )}
          <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Text recognition can misread small or blurry text, so check names
            and numbers that matter.
          </p>
          <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
            <button type="button" className={textButton} onClick={handleBack}>
              Choose another language
            </button>
            <span aria-hidden="true" className="mx-2">
              ·
            </span>
            <button
              type="button"
              className={textButton}
              onClick={handleStartOver}
            >
              Read other images
            </button>
          </p>
        </div>
      )}
    </section>
  )
}

export default ImageToText
