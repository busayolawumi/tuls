import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ProgressPanel } from '../../components/ProgressPanel'
import { stopHeif } from '../../engines/heif/client'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import {
  openPicture,
  PictureError,
  savePicture,
  thumbnail,
  type ImageFormat,
} from '../../lib/picture'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import {
  ACCEPT,
  checkImage,
  imagesLabel,
  MAX_IMAGE_SIZE,
  MAX_IMAGES,
} from '../images-to-pdf/lib/images'
import {
  EXTENSIONS,
  FORMAT_NOTES,
  FORMATS,
  imageNames,
  listLine,
  loadFormat,
  saveFormat,
  sizeLine,
  smallerNote,
} from './lib/convert'
import { manifest } from './manifest'

type Made = {
  name: string
  blob: Blob
  url: string
  picture: string | null
  detail: string
  short: string
  note?: string
}
type Working = { index: number; total: number; name: string }

const CANT_OPEN =
  'It couldn’t be opened. It may be damaged, or a kind of image this browser can’t read.'
const CANT_SAVE =
  'It couldn’t be saved. It may be too big for this device: try a computer.'

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:convert-images:converting',
)

function ConvertImages() {
  useTitle(`${manifest.name} · Tuls`)
  const [files, setFiles] = useState<File[]>()
  const [format, setFormat] = useState<ImageFormat>(() =>
    loadFormat(globalThis.localStorage),
  )
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [madeAs, setMadeAs] = useState<ImageFormat>('jpeg')
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  const run = useRef(0)

  useEffect(() => {
    const runs = run
    return () => {
      runs.current++
      stopHeif()
    }
  }, [])

  const handleFiles = useCallback((chosen: File[]) => {
    setFiles(chosen.slice(0, MAX_IMAGES))
    setLeftOut(Math.max(0, chosen.length - MAX_IMAGES))
    setFailed([])
    setAnnouncement('')
  }, [])

  function chooseFormat(value: ImageFormat) {
    setFormat(value)
    saveFormat(globalThis.localStorage, value)
  }

  async function handleConvert() {
    if (!files) return
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const names = imageNames(
      files.map((file) => file.name),
      format,
    )
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setFailed([])
    markConverting()
    try {
      for (const [index, file] of files.entries()) {
        setWorking({ index, total: files.length, name: file.name })
        let picture
        try {
          picture = await openPicture(file)
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          problems.push({ name: file.name, message: CANT_OPEN })
          continue
        }
        try {
          if (!wanted()) return abandon()
          const saved = await savePicture(picture, format)
          if (!wanted()) return abandon()
          done.push({
            name: names[index],
            blob: saved.blob,
            url: URL.createObjectURL(saved.blob),
            picture: thumbnail(picture, 112),
            detail: sizeLine(
              saved.width,
              saved.height,
              file.size,
              saved.blob.size,
            ),
            short: listLine(saved.width, saved.height, file.size),
            note: saved.smaller
              ? smallerNote(saved.width, saved.height)
              : undefined,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          problems.push({
            name: file.name,
            message: e instanceof PictureError ? CANT_SAVE : CANT_OPEN,
          })
        } finally {
          picture.bitmap.close()
        }
      }
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
    setFailed(problems)
    setMadeAs(format)
    setMade(done)
  }

  function handleCancel() {
    run.current++
    stopHeif()
    markDone()
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
    setFiles(undefined)
    setFailed([])
    setLeftOut(0)
  }

  const screen = working
    ? 'working'
    : made
      ? 'result'
      : files
        ? 'choose'
        : 'pick'
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])
  useIgnoreFileDrops(screen !== 'pick')

  const startOver = { label: 'Convert other images', onClick: handleStartOver }
  const back = {
    label: 'Choose another format',
    onClick: () => {
      setMade(undefined)
      setFailed([])
    },
  }
  const label = FORMATS.find(([value]) => value === madeAs)?.[1] ?? 'image'
  const notes = made?.filter((file) => file.note) ?? []
  const textButton =
    '-mx-2 -my-3.5 cursor-pointer px-2 py-3.5 underline-offset-4 hover:underline'

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
            Turn iPhone photos (HEIC) into JPG, or convert between JPG, PNG and
            WebP. Location and camera details are left out.
          </p>
          <FileDrop
            what="images"
            hint={`HEIC, JPG, PNG, WebP, AVIF or GIF · up to ${MAX_IMAGES}, ${formatSize(MAX_IMAGE_SIZE)} each`}
            accept={ACCEPT}
            multiple
            check={checkImage}
            onFiles={handleFiles}
          />
          {failed.length > 0 && <FailedList failed={failed} />}
          {closedLastTime && (
            <p className="mt-4 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Last time, the page closed while converting. If it closed by
              itself, the device probably ran out of memory: fewer or smaller
              images, or a computer, should work.
            </p>
          )}
        </>
      )}

      {screen === 'choose' && files && (
        <div className="mt-6 w-full max-w-xl text-left sm:mt-8">
          <ul
            aria-label="The images"
            className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
          >
            {files.slice(0, 6).map((file, i) => (
              // Two images can share a name.
              <li
                key={i}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {formatSize(file.size)}
                </span>
              </li>
            ))}
            {files.length > 6 && (
              <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                and {files.length - 6} more
              </li>
            )}
          </ul>
          {leftOut > 0 && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Up to {MAX_IMAGES} images can go in at once, so {leftOut}{' '}
              {leftOut === 1 ? 'was' : 'were'} left out.
            </p>
          )}

          <fieldset className="mt-6">
            <legend className="text-sm font-medium">Convert to</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {FORMATS.map(([value, name]) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-2.5 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
                >
                  <input
                    type="radio"
                    name="format"
                    value={value}
                    checked={format === value}
                    onChange={() => chooseFormat(value)}
                    aria-labelledby={`format-${value}`}
                    aria-describedby={`format-${value}-note`}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span>
                    <span
                      id={`format-${value}`}
                      className="block text-sm font-medium"
                    >
                      {name}
                    </span>
                    <span
                      id={`format-${value}-note`}
                      className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {FORMAT_NOTES[value]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={() => void handleConvert()}
            className="mt-6 w-full cursor-pointer rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {files.length > 1
              ? `Convert ${files.length} images`
              : 'Convert image'}
          </button>
          {phone && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              On a phone, very big photos may be saved a little smaller, as big
              as the phone can make.
            </p>
          )}
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
          label={
            working.total > 1
              ? `Converting ${working.index + 1} of ${working.total}: ${working.name}…`
              : `Converting ${working.name}…`
          }
          ratio={working.total > 1 ? working.index / working.total : undefined}
          barLabel="Converting"
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && made && (
        <>
          {failed.length > 0 && <FailedList failed={failed} />}
          {made.length === 1 && (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={made[0].name}
              downloadLabel={`Download ${label}`}
              details={made[0].detail}
              preview={
                <img
                  src={made[0].url}
                  alt={`The converted ${made[0].name}`}
                  className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                />
              }
              after={
                made[0].note && (
                  <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                    {made[0].note}
                  </p>
                )
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
                detail: file.note
                  ? `${file.short} · saved smaller`
                  : file.short,
              }))}
              start="Images"
              nameOf={(_, i) => made[i].name}
              nameField={false}
              count={imagesLabel(made.length)}
              label="The converted images"
              after={
                notes.length > 0 && (
                  <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                    {notes.length === 1
                      ? '1 photo was'
                      : `${notes.length} photos were`}{' '}
                    saved smaller, at the most this browser can make.
                  </p>
                )
              }
              back={back}
              startOver={startOver}
            />
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
          {made.length > 0 && (
            <p className="mt-8 max-w-md text-xs text-zinc-500 dark:text-zinc-400">
              The new {made.length > 1 ? 'files' : 'file'} keep the picture and
              its colours, without location, camera or other details.{' '}
              {EXTENSIONS[madeAs] === 'jpg' &&
                'Any see-through parts are now white.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default ConvertImages
