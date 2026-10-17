import { useState } from 'react'
import { download } from '../lib/download'
import { fileName } from '../lib/fileName'
import { formatSize } from '../lib/format'
import { canShareFiles, shareFiles } from '../lib/share'
import { zipFiles } from '../lib/zip'
import { FileNameField } from './FileNameField'

// Several finished files: one name for them all, then all of them at once
// (a ZIP, or Share where the browser can), then each one with a small
// picture, a line about it, its size and its own Download.

/** A finished file. Its name comes from the name typed (see `nameOf`). */
export type MadeFile = {
  blob: Blob
  /** An object URL for `blob`. */
  url: string
  /** A small picture of it, if there is one yet. */
  picture?: string | null
  /** A line about it, e.g. "Pages 4–7". */
  detail: string
}

type Action = { label: string; onClick: () => void }

type Props = {
  files: MadeFile[]
  /** What the names start with to begin with, e.g. "report". */
  start: string
  /** Each file's name, from the name typed, e.g. report-pages-1-3.pdf. */
  nameOf: (base: string, index: number) => string
  /** How many there are, in words, e.g. "3 parts". */
  count: string
  /** The list's name for screen readers, e.g. "The new PDFs". */
  label: string
  /**
   * Whether one name, typed, names them all. Off for files with names of
   * their own (Word to PDF's documents); the ZIP is then `start`.zip.
   */
  nameField?: boolean
  back?: Action
  startOver: Action
}

export function FilesResult({
  files,
  start,
  nameOf,
  count,
  label,
  nameField = true,
  back,
  startOver,
}: Props) {
  const [typed, setTyped] = useState(start)
  const base = fileName(typed, start)
  const named = files.map((file, i) => ({ ...file, name: nameOf(base, i) }))
  const total = files.reduce((sum, file) => sum + file.blob.size, 0)
  const [shareable] = useState(() => canShareFiles(files[0].blob.type))
  const [zipping, setZipping] = useState(false)

  // The ZIP is made when it's asked for, so it has the names as they are
  // then, and isn't kept in memory for nothing.
  async function handleZip() {
    setZipping(true)
    try {
      const entries = await Promise.all(
        named.map(async (file) => ({
          name: file.name,
          data: new Uint8Array(await file.blob.arrayBuffer()),
        })),
      )
      download(
        new Blob([zipFiles(entries)], { type: 'application/zip' }),
        `${base}.zip`,
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
        {count} · {formatSize(total)}
      </p>

      {nameField && (
        <FileNameField value={typed} onChange={setTyped} label="File names" />
      )}

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
                  (file) =>
                    new File([file.blob], file.name, { type: file.blob.type }),
                ),
              )
            }
          >
            Share all
          </button>
        )}
      </div>

      <ol aria-label={label} className="mt-6 flex flex-col gap-2 text-left">
        {named.map((file) => (
          <li
            key={file.url}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
          >
            {/* The whole picture, upright or wide (a slide), in a square. */}
            <span className="flex h-14 w-14 shrink-0 items-center justify-center">
              {file.picture ? (
                <img
                  src={file.picture}
                  alt=""
                  className="max-h-full max-w-full rounded-sm border border-zinc-200 dark:border-zinc-800"
                />
              ) : (
                <span className="h-14 w-10 rounded-sm bg-zinc-100 dark:bg-zinc-900" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" title={file.name}>
                {file.name}
              </p>
              <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {file.detail} · {formatSize(file.blob.size)}
              </p>
            </div>
            <a
              className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              href={file.url}
              download={file.name}
              aria-label={`Download ${file.name}`}
            >
              Download
            </a>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        {back && (
          <>
            <button type="button" className={textButton} onClick={back.onClick}>
              {back.label}
            </button>
            {' · '}
          </>
        )}
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
