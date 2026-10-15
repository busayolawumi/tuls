import { useMemo } from 'react'
import type { Pictures } from '../../components/pdf/usePagePictures'
import { formatSize } from '../../lib/format'
import { partsLabel, rangeLabel } from './lib/parts'

/** A finished file, ready to download. */
export type Made = { name: string; blob: Blob; url: string }
export type MadePart = Made & { pages: number[] }

type Action = { label: string; onClick: () => void }

type Props = {
  parts: MadePart[]
  zip?: Made
  pictures: Pictures
  back: Action
  startOver: Action
}

// The new PDFs: all of them at once (a ZIP, or Share where the browser can),
// then each one with its first page, pages and size.
export function PartsResult({ parts, zip, pictures, back, startOver }: Props) {
  const total = parts.reduce((sum, part) => sum + part.blob.size, 0)

  // Only some browsers (mostly on phones) can share files. Where they can't,
  // the Share button doesn't appear.
  const shareable = useMemo(() => {
    const files = parts.map(
      (part) => new File([part.blob], part.name, { type: 'application/pdf' }),
    )
    return navigator.canShare?.({ files }) ? files : undefined
  }, [parts])

  async function handleShare() {
    if (!shareable) return
    try {
      await navigator.share({ files: shareable })
    } catch (e) {
      // Closing the share sheet counts as an error, but it isn't one.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error(e)
      }
    }
  }

  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'

  return (
    <div className="mt-6 w-full max-w-xl text-center sm:mt-8">
      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {partsLabel(parts.length)} · {formatSize(total)}
      </p>

      <div className="mt-4 flex justify-center gap-2">
        {zip && (
          <a
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            href={zip.url}
            download={zip.name}
          >
            Download all (ZIP)
          </a>
        )}
        {shareable && (
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={handleShare}
          >
            Share all
          </button>
        )}
      </div>

      <ol
        aria-label="The new PDFs"
        className="mt-6 flex flex-col gap-2 text-left"
      >
        {parts.map((part) => {
          const picture = pictures.get(part.pages[0])
          return (
            <li
              key={part.name}
              className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
            >
              {picture ? (
                <img
                  src={picture}
                  alt=""
                  className="h-14 w-10 shrink-0 rounded-sm border border-zinc-200 object-cover dark:border-zinc-800"
                />
              ) : (
                <span className="h-14 w-10 shrink-0 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={part.name}>
                  {part.name}
                </p>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {rangeLabel(part.pages)} · {formatSize(part.blob.size)}
                </p>
              </div>
              <a
                className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                href={part.url}
                download={part.name}
                aria-label={`Download ${part.name}`}
              >
                Download
              </a>
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        <button type="button" className={textButton} onClick={back.onClick}>
          {back.label}
        </button>
        {' · '}
        <button
          type="button"
          className={textButton}
          onClick={startOver.onClick}
        >
          {startOver.label}
        </button>
      </p>
    </div>
  )
}
