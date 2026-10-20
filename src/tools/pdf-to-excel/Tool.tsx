import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ProgressPanel } from '../../components/ProgressPanel'
import { ToolLink } from '../../components/ToolLink'
import { PDF_ERROR_MESSAGES, pdfErrorKind } from '../../engines/pdf/errors'
import { ACCEPT } from '../../engines/pdf/files'
import {
  isLightEngineSaved,
  LIGHT_DOWNLOAD_SIZE,
} from '../../engines/pymupdf/download'
import {
  findTables,
  holdEngine,
  releaseEngine,
  stopEngine,
  type EngineStep,
} from '../../engines/pymupdf/engine'
import {
  WORD_ERROR_MESSAGES,
  wordErrorKind,
} from '../../engines/pymupdf/errors'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import { outputNames } from '../../lib/outputNames'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { regionColumn } from '../../lib/xlsx/values'
import { checkPdfFile } from '../pdf-to-word/lib/files'
import { inspectPdf } from '../pdf-to-word/lib/inspect'
import { manifest as unlockPdf } from '../unlock-pdf/manifest'
import { TableChoices, type Item } from './TableChoices'
import {
  ALL_SCANNED,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PAGES,
  tablesLabel,
  tooManyPages,
  workbook,
  XLSX,
} from './lib/tables'
import { manifest } from './manifest'

type Made = {
  name: string
  blob: Blob
  url: string
  picture: string | null
  tables: number
}
type Checking = { index: number; total: number; name: string }
type Working = { step: EngineStep; index: number; total: number; name: string }

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:pdf-to-excel:converting',
)

function stepLabel({ step, index, total, name }: Working) {
  if (step.step === 'download') return 'Downloading the converter…'
  if (step.step === 'start') return 'Starting the converter…'
  return total > 1
    ? `Finding tables in ${index + 1} of ${total}: ${name}…`
    : `Finding tables in ${name}…`
}

function PdfToExcel() {
  useTitle(`${manifest.name} · Tuls`)
  const [checking, setChecking] = useState<Checking>()
  const [working, setWorking] = useState<Working>()
  const [items, setItems] = useState<Item[]>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<boolean>()
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
    void isLightEngineSaved().then(setSaved)
  }, [items])

  const handleFiles = useCallback(async (chosen: File[]) => {
    const files = chosen.slice(0, MAX_FILES)
    const id = ++run.current
    const wanted = () => run.current === id
    const problems: Failed[] = []
    const checked: (Omit<Item, 'tables' | 'chosen'> & { file: File })[] = []
    setError(undefined)
    setFailed([])
    setLeftOut(chosen.length - files.length)
    setAnnouncement('')
    try {
      for (const [index, file] of files.entries()) {
        setChecking({ index, total: files.length, name: file.name })
        try {
          const inspected = await inspectPdf(file, MAX_PAGES)
          if (!wanted()) return
          if (inspected.pages > MAX_PAGES) {
            problems.push({
              name: file.name,
              message: tooManyPages(inspected.pages),
            })
          } else if (inspected.scanned.length === inspected.pages) {
            problems.push({ name: file.name, message: ALL_SCANNED })
          } else {
            checked.push({ ...inspected, file })
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
    if (checked.length === 0) return setFailed(problems)

    const found: Item[] = []
    markConverting()
    try {
      for (const [index, item] of checked.entries()) {
        let step = { step: 'start' } as EngineStep
        const show = (next: EngineStep) => {
          step = next
          if (wanted()) {
            setWorking({
              step,
              index,
              total: checked.length,
              name: item.file.name,
            })
          }
        }
        show(step)
        try {
          const tables = await findTables(item.file, item.pages, show)
          if (!wanted()) return
          found.push({ ...item, tables, chosen: tables.map(() => true) })
        } catch (e) {
          if (!wanted()) return
          console.warn(e)
          const kind = wordErrorKind(e)
          if (step.step !== 'tables') {
            setFailed(problems)
            setError(
              kind === 'network'
                ? WORD_ERROR_MESSAGES.network
                : 'The converter couldn’t start. Reload the page and try again, or try another browser.',
            )
            return
          }
          problems.push({
            name: item.file.name,
            message: WORD_ERROR_MESSAGES[kind],
          })
        }
      }
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
    setFailed(problems)
    if (found.length > 0) setItems(found)
  }, [])

  function handleToggle(item: number, table: number) {
    setItems((current) =>
      current?.map((entry, i) =>
        i === item
          ? {
              ...entry,
              chosen: entry.chosen.map((on, j) => (j === table ? !on : on)),
            }
          : entry,
      ),
    )
  }

  function handleMake() {
    if (!items) return
    const region = regionColumn(navigator.language)
    const files: Made[] = []
    for (const item of items) {
      const tables = item.tables.filter((_, i) => item.chosen[i])
      if (tables.length === 0) continue
      const blob = new Blob([workbook(tables, region)], { type: XLSX })
      files.push({
        name: item.file.name,
        blob,
        url: URL.createObjectURL(blob),
        picture: item.picture,
        tables: tables.length,
      })
    }
    setMade(files)
  }

  function handleCancel() {
    run.current++
    stopEngine()
    markDone()
    setChecking(undefined)
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was converted.')
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
        'xlsx',
      )
    : []
  const startOver = { label: 'Convert other PDFs', onClick: handleStartOver }
  const back = {
    label: 'Back to the tables',
    onClick: () => setMade(undefined),
  }
  const problems = (failed.length > 0 || leftOut > 0) && (
    <>
      {failed.length > 0 && <FailedList failed={failed} />}
      {failed.some((file) => file.message === PDF_ERROR_MESSAGES.password) && (
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
            Turn the tables in PDFs into spreadsheets. Works best with
            statements, invoices and reports made on a computer.
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
          {problems}
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while finding tables. If it closed by
              itself, the device probably ran out of memory: a shorter PDF, or a
              computer, should work.
            </p>
          )}
          {(saved === false || phone) && (
            <div className="mt-2 max-w-md space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
              {saved === false && (
                <p>
                  The converter is a {formatSize(LIGHT_DOWNLOAD_SIZE)} download
                  the first time, then it’s kept on this device.
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
          barLabel="Checking"
          onCancel={handleCancel}
        />
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
          barLabel="Finding tables"
          onCancel={handleCancel}
        />
      )}

      {screen === 'choose' && items && (
        <TableChoices
          items={items}
          problems={problems}
          onToggle={handleToggle}
          onMake={handleMake}
          onStartOver={handleStartOver}
        />
      )}

      {screen === 'result' && made && (
        <>
          {made.length === 1 ? (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={names[0]}
              downloadLabel="Download Excel file"
              details={`${tablesLabel(made[0].tables)} · ${formatSize(made[0].blob.size)}`}
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
                detail: tablesLabel(file.tables),
              }))}
              start="Excel files"
              nameOf={(_, i) => names[i]}
              nameField={false}
              count={`${made.length} Excel files`}
              label="The Excel files"
              back={back}
              startOver={startOver}
            />
          )}
          <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
            Check the numbers before you rely on them: tables in PDFs can be
            laid out in ways Tuls misreads.
          </p>
        </>
      )}
    </section>
  )
}

export default PdfToExcel
