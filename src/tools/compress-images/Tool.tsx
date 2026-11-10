import { useCallback, useEffect, useRef, useState } from 'react'
import { FailedList, type Failed } from '../../components/FailedList'
import { FileDrop } from '../../components/FileDrop'
import { FileResult } from '../../components/FileResult'
import { FilesResult } from '../../components/FilesResult'
import { CompareSlider } from '../../components/images/CompareSlider'
import { ImageList } from '../../components/images/ImageList'
import { NumberBox } from '../../components/images/NumberBox'
import { ProgressPanel } from '../../components/ProgressPanel'
import { stopHeif } from '../../engines/heif/client'
import { compressPixels, stopImages } from '../../engines/images/client'
import { formatSize } from '../../lib/format'
import { withProfile } from '../../lib/jpeg'
import { lastRun } from '../../lib/lastRun'
import {
  beforeUrl,
  fitPixels,
  openPicture,
  p3Profile,
  PHONE_PIXELS,
  PictureError,
  picturePixels,
  shrinkPicture,
  thumbnail,
  type Picture,
} from '../../lib/picture'
import { useIgnoreFileDrops } from '../../lib/useIgnoreFileDrops'
import { useTitle } from '../../lib/useTitle'
import {
  isWorthIt,
  savingDetail,
  savingLine,
} from '../compress-pdf/lib/compress'
import { smallerNote } from '../convert-images/lib/convert'
import {
  ACCEPT,
  checkImage,
  imagesLabel,
  MAX_IMAGE_SIZE,
  MAX_IMAGES,
} from '../images-to-pdf/lib/images'
import { formatFor, sizeChange } from '../resize-images/lib/resize'
import {
  CHOICE_NOTES,
  CHOICES,
  compressedNames,
  loadSettings,
  MAX_MB,
  MIN_MB,
  saveSettings,
  sizeNote,
  underBytes,
  type Settings,
} from './lib/compress'
import { manifest } from './manifest'

type Size = { width: number; height: number }
type Made = {
  name: string
  blob: Blob
  url: string
  before?: string
  picture: string | null
  from: Size
  size: Size
  beforeBytes: number
  note?: string
  nowWhite: boolean
}
type Small = { name: string; size: number; under: boolean }
type Working = { index: number; total: number; name: string }

const CANT_OPEN =
  'It couldn’t be opened. It may be damaged, or a kind of image this browser can’t read.'
const CANT_SAVE =
  'It couldn’t be compressed. It may be too big for this device: try a computer.'
const TYPES = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const FORMAT_LABELS = { jpeg: 'JPG', png: 'PNG', webp: 'WebP' }
const BEFORE_SIDE = 2048
const textButton =
  '-mx-2 -my-3.5 cursor-pointer px-2 py-3.5 underline-offset-4 hover:underline'
const primary =
  'w-full cursor-pointer rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300'

const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:compress-images:compressing',
)

function SmallList({ small, title }: { small: Small[]; title?: string }) {
  return (
    <>
      {title && (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">{title}</p>
      )}
      <ul aria-label="Images with no new copy" className="mt-2 space-y-1">
        {small.map((file, i) => (
          // Two images can share a name.
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
    </>
  )
}

function CompressImages() {
  useTitle(`${manifest.name} · Tuls`)
  const [files, setFiles] = useState<File[]>()
  const [settings, setSettings] = useState<Settings>(() =>
    loadSettings(globalThis.localStorage),
  )
  const [ranWith, setRanWith] = useState<Settings>(settings)
  const [problem, setProblem] = useState('')
  const [working, setWorking] = useState<Working>()
  const [made, setMade] = useState<Made[]>()
  const [small, setSmall] = useState<Small[]>([])
  const [failed, setFailed] = useState<Failed[]>([])
  const [compared, setCompared] = useState(0)
  const [leftOut, setLeftOut] = useState(0)
  const [closedLastTime] = useState(() => closedWhileConverting())
  const [announcement, setAnnouncement] = useState('')
  const [phone] = useState(() => matchMedia('(pointer: coarse)').matches)
  const run = useRef(0)
  const underBox = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const runs = run
    return () => {
      runs.current++
      stopHeif()
      stopImages()
    }
  }, [])

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
    return next
  }

  async function handleCompress(chosen: Settings = settings) {
    if (!files) return
    const under =
      chosen.choice === 'under' ? underBytes(chosen.under) : undefined
    if (chosen.choice === 'under' && !under) {
      setProblem(`Type a size from ${MIN_MB} to ${MAX_MB} MB.`)
      underBox.current?.focus()
      return
    }
    const id = ++run.current
    const wanted = () => run.current === id
    const done: Made[] = []
    const tooSmall: Small[] = []
    const problems: Failed[] = []
    const names = compressedNames(files)
    const abandon = () => {
      for (const file of done) {
        URL.revokeObjectURL(file.url)
        if (file.before) URL.revokeObjectURL(file.before)
      }
    }
    setFailed([])
    setRanWith(chosen)
    markConverting()
    try {
      for (const [index, file] of files.entries()) {
        setWorking({ index, total: files.length, name: file.name })
        if (under && file.size <= under) {
          tooSmall.push({ name: file.name, size: file.size, under: true })
          continue
        }
        let picture: Picture
        try {
          picture = await openPicture(file)
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          problems.push({ name: file.name, message: CANT_OPEN })
          continue
        }
        let source = picture
        try {
          if (!wanted()) return abandon()
          const format = formatFor(file)
          if (phone && picture.width * picture.height > PHONE_PIXELS) {
            const fit = fitPixels(picture.width, picture.height, PHONE_PIXELS)
            source = await shrinkPicture(picture, fit.width, fit.height)
          }
          const profile =
            format === 'jpeg' && source.p3 ? await p3Profile() : undefined
          const pixels = picturePixels(
            source,
            Boolean(profile),
            format === 'jpeg',
          )
          const result = await compressPixels(
            pixels.data.buffer,
            pixels.width,
            pixels.height,
            format,
            under
              ? { under: under - (profile?.length ?? 0) }
              : {
                  level:
                    chosen.choice === 'smallest' ? 'smallest' : 'recommended',
                },
          )
          if (!wanted()) return abandon()
          if (!result) {
            problems.push({
              name: file.name,
              message: `It couldn’t be made smaller than ${formatSize(under ?? 0)}.`,
            })
            continue
          }
          const bytes = profile
            ? withProfile(new Uint8Array(result.bytes), profile)
            : new Uint8Array(result.bytes)
          if (!isWorthIt(file.size, bytes.length)) {
            tooSmall.push({ name: file.name, size: file.size, under: false })
            continue
          }
          const blob = new Blob([bytes], { type: TYPES[format] })
          const size = { width: result.width, height: result.height }
          const before = await beforeUrl(file, picture, BEFORE_SIDE)
          if (!wanted()) {
            if (before) URL.revokeObjectURL(before)
            return abandon()
          }
          done.push({
            name: names[index],
            blob,
            url: URL.createObjectURL(blob),
            before,
            picture: thumbnail(source, 112),
            from: picture,
            size,
            beforeBytes: file.size,
            nowWhite:
              format === 'jpeg' && /avif/i.test(`${file.type} ${file.name}`),
            note:
              size.width < source.width
                ? sizeNote(size.width, size.height, chosen.choice, under)
                : source !== picture
                  ? smallerNote(size.width, size.height)
                  : undefined,
          })
        } catch (e) {
          if (!wanted()) return abandon()
          console.warn(e)
          problems.push({
            name: file.name,
            message: e instanceof PictureError ? CANT_OPEN : CANT_SAVE,
          })
        } finally {
          if (source !== picture) source.bitmap.close()
          picture.bitmap.close()
        }
      }
    } finally {
      markDone()
      if (wanted()) setWorking(undefined)
    }
    setFailed(problems)
    setSmall(tooSmall)
    setCompared(0)
    setMade(done)
  }

  function handleTrySmallest() {
    const next = change({ choice: 'smallest' })
    setMade(undefined)
    void handleCompress(next)
  }

  function handleCancel() {
    run.current++
    stopHeif()
    stopImages()
    markDone()
    setWorking(undefined)
    setAnnouncement('Stopped. Nothing was compressed.')
  }

  useEffect(() => {
    if (!made) return
    return () => {
      for (const file of made) {
        URL.revokeObjectURL(file.url)
        if (file.before) URL.revokeObjectURL(file.before)
      }
    }
  }, [made])

  function handleStartOver() {
    setMade(undefined)
    setFiles(undefined)
    setFailed([])
    setSmall([])
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

  const startOver = {
    label: 'Compress other images',
    onClick: handleStartOver,
  }
  const back = {
    label: 'Try another size',
    onClick: () => {
      setMade(undefined)
      setFailed([])
      setSmall([])
    },
  }
  const ranUnder =
    ranWith.choice === 'under' ? underBytes(ranWith.under) : undefined
  const underSmall = small.filter((file) => file.under)
  const levelSmall = small.filter((file) => !file.under)
  const them = (list: unknown[]) => (list.length > 1 ? 'they' : 'it')
  const smallLists = (
    <>
      {underSmall.length > 0 && ranUnder && (
        <SmallList
          small={underSmall}
          title={`Already under ${formatSize(ranUnder)}, so there’s no new copy:`}
        />
      )}
      {levelSmall.length > 0 && (
        <SmallList
          small={levelSmall}
          title="Already about as small as it gets, so there’s no new copy:"
        />
      )}
    </>
  )
  const compare = made?.[compared]
  const totalBefore =
    made?.reduce((sum, file) => sum + file.beforeBytes, 0) ?? 0
  const totalAfter = made?.reduce((sum, file) => sum + file.blob.size, 0) ?? 0
  const notes = made?.filter((file) => file.note).length ?? 0
  const label = (file: Made) =>
    FORMAT_LABELS[formatFor({ name: file.name, type: '' })]

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
            Make images smaller in file size, keeping how they look. Location
            and camera details are left out.
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
              Last time, the page closed while compressing. If it closed by
              itself, the device probably ran out of memory: fewer or smaller
              images, or a computer, should work.
            </p>
          )}
        </>
      )}

      {screen === 'choose' && files && (
        <div className="mt-6 w-full max-w-xl text-left sm:mt-8">
          <ImageList files={files} leftOut={leftOut} />

          <fieldset className="mt-6">
            <legend className="sr-only">How small</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CHOICES.map(([value, name]) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-2.5 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-zinc-400 has-checked:border-zinc-900 has-checked:bg-zinc-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent dark:border-zinc-800 dark:hover:border-zinc-600 dark:has-checked:border-zinc-100 dark:has-checked:bg-zinc-900"
                >
                  <input
                    type="radio"
                    name="choice"
                    value={value}
                    checked={settings.choice === value}
                    onChange={() => change({ choice: value })}
                    aria-labelledby={`choice-${value}`}
                    aria-describedby={`choice-${value}-note`}
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-zinc-900 dark:accent-zinc-100"
                  />
                  <span>
                    <span
                      id={`choice-${value}`}
                      className="block text-sm font-medium"
                    >
                      {name}
                    </span>
                    <span
                      id={`choice-${value}-note`}
                      className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      {CHOICE_NOTES[value]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {settings.choice === 'under' && (
            <div className="mt-4 max-w-48">
              <NumberBox
                label="Each image under"
                unit="MB"
                value={settings.under}
                onChange={(under) => change({ under })}
                invalid={Boolean(problem)}
                problemId="compress-problem"
                decimal
                inputRef={underBox}
              />
            </div>
          )}
          {problem && (
            <p
              id="compress-problem"
              role="alert"
              className="mt-2 text-sm text-red-700 dark:text-red-400"
            >
              {problem}
            </p>
          )}
          {settings.choice === 'under' && (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              The quality comes down first. If that isn’t enough, the picture is
              made smaller too, and you’ll be told.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleCompress()}
            className={`mt-6 ${primary}`}
          >
            {files.length > 1
              ? `Compress ${files.length} images`
              : 'Compress image'}
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
              ? `Compressing ${working.index + 1} of ${working.total}: ${working.name}…`
              : `Compressing ${working.name}…`
          }
          ratio={working.total > 1 ? working.index / working.total : undefined}
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
                {levelSmall.length === 0 && ranUnder
                  ? `Already under ${formatSize(ranUnder)}`
                  : `Already about as small as ${small.length > 1 ? 'they get' : 'it gets'}`}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {levelSmall.length === 0
                  ? `${small.length > 1 ? 'They’re' : 'It’s'} under the size you chose already, so there’s nothing to do.`
                  : ranWith.choice === 'recommended'
                    ? `Recommended couldn’t make ${them(levelSmall)} at least 5% smaller. Smallest goes further, so it may.`
                    : `Couldn’t make ${them(levelSmall)} at least 5% smaller: ${levelSmall.length > 1 ? 'they’re' : 'it’s'} compressed well already.`}
              </p>
              <SmallList small={small} />
              {ranWith.choice === 'recommended' && (
                <button
                  type="button"
                  onClick={handleTrySmallest}
                  className={`mt-5 ${primary}`}
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
              name={made[0].name}
              downloadLabel={`Download ${label(made[0])}`}
              details={`${sizeChange(made[0].from, made[0].size)} · ${savingLine(made[0].beforeBytes, made[0].blob.size)}`}
              preview={
                made[0].before ? (
                  <CompareSlider
                    before={made[0].before}
                    after={made[0].url}
                    width={made[0].size.width}
                    height={made[0].size.height}
                    name={made[0].name}
                  />
                ) : (
                  <img
                    src={made[0].url}
                    alt={`The compressed ${made[0].name}`}
                    className="mx-auto max-h-72 max-w-full rounded border border-zinc-200 dark:border-zinc-800"
                  />
                )
              }
              after={
                <>
                  {made[0].note && (
                    <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                      {made[0].note}
                    </p>
                  )}
                  {smallLists}
                </>
              }
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
                  detail: `${file.size.width} × ${file.size.height} · ${savingDetail(file.beforeBytes, file.blob.size)}`,
                }))}
                start="Compressed images"
                nameOf={(_, i) => made[i].name}
                nameField={false}
                count={imagesLabel(made.length)}
                label="The compressed images"
                after={
                  <>
                    {compare?.before && (
                      <div className="mt-8 w-full text-left">
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            aria-label="Previous image"
                            onClick={() =>
                              setCompared(
                                (compared - 1 + made.length) % made.length,
                              )
                            }
                            className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
                          >
                            ←
                          </button>
                          <p
                            aria-live="polite"
                            className="min-w-0 truncate text-sm"
                            title={compare.name}
                          >
                            <span className="font-medium">Compare</span>{' '}
                            {compare.name}{' '}
                            <span className="text-zinc-500 dark:text-zinc-400">
                              ({compared + 1} of {made.length})
                            </span>
                          </p>
                          <button
                            type="button"
                            aria-label="Next image"
                            onClick={() =>
                              setCompared((compared + 1) % made.length)
                            }
                            className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
                          >
                            →
                          </button>
                        </div>
                        <div className="mt-3">
                          <CompareSlider
                            key={compared}
                            before={compare.before}
                            after={compare.url}
                            width={compare.size.width}
                            height={compare.size.height}
                            name={compare.name}
                          />
                        </div>
                      </div>
                    )}
                    {notes > 0 && (
                      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
                        {notes === 1
                          ? '1 picture was'
                          : `${notes} pictures were`}{' '}
                        made smaller in width and height too: see{' '}
                        {notes === 1 ? 'its' : 'their'} sizes above.
                      </p>
                    )}
                    {smallLists}
                  </>
                }
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
                onClick={back.onClick}
              >
                {back.label}
              </button>
              {' · '}
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
              {made.some((file) => file.nowWhite) &&
                ' AVIF images became JPGs, which have no see-through parts, so any are now white.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}

export default CompressImages
