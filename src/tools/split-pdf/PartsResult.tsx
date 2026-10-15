import { useState } from 'react'
import { FileNameField } from '../../components/FileNameField'
import type { Pictures } from '../../components/pdf/usePagePictures'
import { download } from '../../lib/download'
import { fileName } from '../../lib/fileName'
import { formatSize } from '../../lib/format'
import { canShareFiles, shareFiles } from '../../lib/share'
import { zipFiles } from '../../lib/zip'
import { partName, partsLabel, rangeLabel, zipName } from './lib/parts'

/** A new PDF: its pages (numbered from 0) and the file itself. */
export type MadePart = { pages: number[]; blob: Blob; url: string }

type Action = { label: string; onClick: () => void }

type Props = {
  parts: MadePart[]
  /** What the files' names start with to begin with, e.g. "report". */
  start: string
  pictures: Pictures
  back: Action
  startOver: Action
}

// The new PDFs: one name for them all, then all of them at once (a ZIP, or
// Share where the browser can), then each one with its first page, pages
// and size.
export function PartsResult({
  parts,
  start,
  pictures,
  back,
  startOver,
}: Props) {
  const [typed, setTyped] = useState(start)
  const base = fileName(typed, start)
  const named = parts.map((part) => ({
    ...part,
    name: partName(base, part.pages),
  }))
  const total = parts.reduce((sum, part) => sum + part.blob.size, 0)
  const [shareable] = useState(() => canShareFiles('application/pdf'))
  const [zipping, setZipping] = useState(false)

  // The ZIP is made when it's asked for, so it has the names as they are
  // then, and isn't kept in memory for nothing.
  async function handleZip() {
    setZipping(true)
    try {
      const files = await Promise.all(
        named.map(async (part) => ({
          name: part.name,
          data: new Uint8Array(await part.blob.arrayBuffer()),
        })),
      )
      download(
        new Blob([zipFiles(files)], { type: 'application/zip' }),
        zipName(base),
      )
    } finally {
      setZipping(false)
    }
  }

  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'

  return (
    <div className="mt-6 w-full max-w-xl text-center sm:mt-8">
      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {partsLabel(parts.length)} · {formatSize(total)}
      </p>

      <FileNameField value={typed} onChange={setTyped} label="File names" />

      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          disabled={zipping}
          aria-busy={zipping}
          onClick={handleZip}
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {zipping ? 'Zipping…' : 'Download all (ZIP)'}
        </button>
        {shareable && (
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() =>
              shareFiles(
                named.map(
                  (part) =>
                    new File([part.blob], part.name, {
                      type: 'application/pdf',
                    }),
                ),
              )
            }
          >
            Share all
          </button>
        )}
      </div>

      <ol
        aria-label="The new PDFs"
        className="mt-6 flex flex-col gap-2 text-left"
      >
        {named.map((part) => {
          const picture = pictures.get(part.pages[0])
          return (
            <li
              key={part.pages[0]}
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
