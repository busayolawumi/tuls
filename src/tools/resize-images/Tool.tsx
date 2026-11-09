import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { ImageList } from '../../components/images/ImageList'
import { ProgressPanel } from '../../components/ProgressPanel'
import { Segmented } from '../../components/Segmented'
import { stopHeif } from '../../engines/heif/client'
import { stopImages } from '../../engines/images/client'
import { formatSize } from '../../lib/format'
import { lastRun } from '../../lib/lastRun'
import {
  openPicture,
  PictureError,
  savePicture,
  shrinkPicture,
  thumbnail,
  type Picture,
} from '../../lib/picture'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import { smallerNote } from '../convert-images/lib/convert'
import {
  ACCEPT,
  checkImage,
  imagesLabel,
  MAX_IMAGE_SIZE,
  MAX_IMAGES,
} from '../images-to-pdf/lib/images'
import {
  detailLine,
  formatFor,
  loadSettings,
  newSize,
  resizedNames,
  saveSettings,
  sizeChange,
  targetOf,
  type Mode,
  type Settings,
} from './lib/resize'
import { manifest } from './manifest'

type Size = { width: number; height: number }
type Made = {
  name: string
  blob: Blob
  url: string
  picture: string | null
  detail: string
  short: string
  kept: boolean
  note?: string
}
type Working = { index: number; total: number; name: string }

const CANT_OPEN =
  'It couldn’t be opened. It may be damaged, or a kind of image this browser can’t read.'
const CANT_SAVE =
  'It couldn’t be saved. It may be too big for this device: try a computer.'
const FORMAT_LABELS = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' }
const textButton =
  '-mx-2 -my-3.5 cursor-pointer px-2 py-3.5 underline-offset-4 hover:underline'

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:resize-images:resizing',
)

type BoxProps = {
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  inputRef?: React.Ref<HTMLInputElement>
}

function NumberBox({
  label,
  unit,
  value,
  onChange,
  invalid,
  inputRef,
}: BoxProps) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'resize-problem' : undefined}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, ''))}
          className="w-full min-w-0 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base font-normal sm:text-sm dark:border-zinc-700"
        />
        <span
          aria-hidden="true"
          className="font-normal text-zinc-500 dark:text-zinc-400"
        >
          {unit}
        </span>
      </span>
    </label>
  )
}

function ResizeImages() {
  useTitle(`${manifest.name} · Tuls`)
  const [files, setFiles] = useState<File[]>()
  const [settings, setSettings] = useState<Settings>(() =>
    loadSettings(globalThis.localStorage),
  )
  const [problem, setProblem] = useState('')
  const [size, setSize] = useState<Size>()
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [failed, setFailed] = useState<Failed[]>([])
  const [leftOut, setLeftOut] = useState(0)
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  const run = useRef(0)
  const firstBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const runs = run
    return () => {
      runs.current++
      stopHeif()
      stopImages()
    }
  }, [])

  const only = files?.length === 1 ? files[0] : undefined
  useEffect(() => {
    if (!only) return
    let current = true
    openPicture(only).then(
      (picture) => {
        if (current) setSize({ width: picture.width, height: picture.height })
        picture.bitmap.close()
      },
      () => {},
    )
    return () => {
      current = false
      setSize(undefined)
    }
  }, [only])

  const handleFiles = useCallback((chosen: File[]) => {
    setFiles(chosen.slice(0, MAX_IMAGES))
    setLeftOut(Math.max(0, chosen.length - MAX_IMAGES))
    setFailed([])
    setAnnouncement('')
  }, [])

  function change(more: Partial<Settings>) {
    const next = { ...settings, ...more }
    setSettings(next)
    setProblem('')
    saveSettings(globalThis.localStorage, next)
  }

  async function handleResize() {
    if (!files) return
    const target = targetOf(settings)
    if (!target) {
      setProblem(
        settings.mode === 'percent'
          ? 'Type a percentage from 1 to 99.'
          : 'Type a width, a height, or both.',
      )
      firstBox.current?.focus()
      return
    }
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const problems: Failed[] = []
    const names = resizedNames(files)
    const abandon = () => {
      for (const file of done) URL.revokeObjectURL(file.url)
    }
    setFailed([])
    markConverting()
    try {
      for (const [index, file] of files.entries()) {
        setWorking({ index, total: files.length, name: file.name })
        let picture: Picture
        try {
          picture = await openPicture(file)
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          problems.push({ name: file.name, message: CANT_OPEN })
          continue
        }
        let shrunk = picture
        try {
          if (!wanted()) return abandon()
          const to = newSize(picture.width, picture.height, target)
          const kept =
            to.width === picture.width && to.height === picture.height
          if (!kept) shrunk = await shrinkPicture(picture, to.width, to.height)
          if (!wanted()) return abandon()
          const saved = await savePicture(shrunk, formatFor(file))
          if (!wanted()) return abandon()
          done.push({
            name: names[index],
            blob: saved.blob,
            url: URL.createObjectURL(saved.blob),
            picture: thumbnail(shrunk, 112),
            detail: detailLine(picture, saved, file.size, saved.blob.size),
            short: `${sizeChange(picture, saved)} · from ${formatSize(file.size)}`,
            kept,
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
          if (shrunk !== picture) shrunk.bitmap.close()
          picture.bitmap.close()
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
    stopHeif()
    stopImages()
    markDone()
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was resized.')
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
    setProblem('')
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

  const startOver = { label: 'Resize other images', onClick: handleStartOver }
  const back = {
    label: 'Choose another size',
    onClick: () => {
      setMade(undefined)
      setFailed([])
    },
  }
  const target = targetOf(settings)
  const planned = size && target && newSize(size.width, size.height, target)
  const unchanged =
    planned && planned.width === size.width && planned.height === size.height
  const kept = made?.filter((file) => file.kept).length ?? 0
  const notes = made?.filter((file) => file.note).length ?? 0

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
            Make images smaller in width and height, by a percentage or to a
            size you choose. Location and camera details are left out.
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
              Last time, the page closed while resizing. If it closed by itself,
              the device probably ran out of memory: fewer or smaller images, or
              a computer, should work.
            </p>
          )}
        </>
      )}

      {screen === 'choose' && files && (
        <div className="mt-6 w-full max-w-xl text-left sm:mt-8">
          <ImageList files={files} leftOut={leftOut} />

          <div className="mt-6">
            <Segmented<Mode>
              legend="Resize by"
              name="mode"
              options={[
                ['percent', 'Percentage'],
                ['size', 'Width and height'],
              ]}
              value={settings.mode}
              onChange={(mode) => change({ mode })}
            />
          </div>

          {settings.mode === 'percent' ? (
            <div className="mt-4 max-w-40">
              <NumberBox
                label="Percentage"
                unit="%"
                value={settings.percent}
                onChange={(percent) => change({ percent })}
                invalid={Boolean(problem)}
                inputRef={firstBox}
              />
            </div>
          ) : (
            <div className="mt-4 grid max-w-sm grid-cols-2 gap-3">
              <NumberBox
                label="Width"
                unit="px"
                value={settings.width}
                onChange={(width) => change({ width })}
                invalid={Boolean(problem)}
                inputRef={firstBox}
              />
              <NumberBox
                label="Height"
                unit="px"
                value={settings.height}
                onChange={(height) => change({ height })}
                invalid={Boolean(problem)}
              />
            </div>
          )}

          {problem && (
            <p
              id="resize-problem"
              role="alert"
              className="mt-2 text-sm text-red-700 dark:text-red-400"
            >
              {problem}
            </p>
          )}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {settings.mode === 'percent'
              ? '50% makes the width and height half as big.'
              : 'Fill in one and the other follows, or both to fit inside that size. Proportions stay the same.'}
          </p>
          <p
            aria-live="polite"
            className="mt-2 min-h-5 text-sm font-medium tabular-nums"
          >
            {planned &&
              size &&
              (unchanged
                ? 'It’s already smaller than that, so its size won’t change.'
                : sizeChange(size, planned))}
            {files.length > 1 &&
              settings.mode === 'size' &&
              'Images already smaller than this keep their size.'}
          </p>

          <button
            type="button"
            onClick={() => void handleResize()}
            className="mt-4 w-full cursor-pointer rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {files.length > 1
              ? `Resize ${files.length} images`
              : 'Resize image'}
          </button>
          {phone && (
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              On a phone, lots of very big photos may not fit in its memory.
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
              ? `Resizing ${working.index + 1} of ${working.total}: ${working.name}…`
              : `Resizing ${working.name}…`
          }
          ratio={working.total > 1 ? working.index / working.total : undefined}
          barLabel="Resizing"
          onCancel={handleCancel}
        />
      )}

      {screen === 'result' && made && files && (
        <>
          {failed.length > 0 && <FailedList failed={failed} />}
          {made.length === 1 && (
            <FileResult
              blob={made[0].blob}
              url={made[0].url}
              name={made[0].name}
              downloadLabel={`Download ${FORMAT_LABELS[formatFor({ name: made[0].name, type: '' })]}`}
              details={made[0].detail}
              preview={
                <img
                  src={made[0].url}
                  alt={`The resized ${made[0].name}`}
                  className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                />
              }
              after={
                (made[0].kept || made[0].note) && (
                  <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                    {made[0].note ??
                      'It was already smaller than that, so its size hasn’t changed.'}
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
              label="The resized images"
              after={
                (kept > 0 || notes > 0) && (
                  <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                    {kept > 0 &&
                      `${kept === 1 ? '1 image was' : `${kept} images were`} already smaller than that, so ${kept === 1 ? 'it keeps its' : 'they keep their'} size. `}
                    {notes > 0 &&
                      `${notes === 1 ? '1 photo was' : `${notes} photos were`} saved smaller, at the most this browser can make.`}
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
              The new {made.length > 1 ? 'files have' : 'file has'} no location,
              camera or other details.
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default ResizeImages
