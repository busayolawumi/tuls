import { useState, type ReactNode } from 'react'
import { canShareFiles, shareFiles } from '../lib/share'
import { useFileName } from '../lib/useFileName'
import { FileNameField } from './FileNameField'

// A finished file: a preview, its details, a name that can be changed,
// Download and (where the browser can) Share, and links to go back or start
// over. Video to GIF's result screen (Gify's) in a form any tool can use.

type Action = { label: string; onClick: () => void }

type Props = {
  blob: Blob
  /** An object URL for `blob`. */
  url: string
  /** The name to start with, e.g. report-merged.pdf. It can be changed. */
  name: string
  /** The button's words, e.g. "Download PDF". */
  downloadLabel: string
  /** A short line under the preview, e.g. "12 pages · 2.4 MB". */
  details: string
  preview?: ReactNode
  /** Another way on, under the Download button, e.g. a new password. */
  more?: ReactNode
  /** Anything more about the result, before the links back. */
  after?: ReactNode
  back?: Action
  startOver: Action
}

export function FileResult({
  blob,
  url,
  name,
  downloadLabel,
  details,
  preview,
  more,
  after,
  back,
  startOver,
}: Props) {
  const file = useFileName(name)
  const [shareable] = useState(() => canShareFiles(blob.type))

  const textButton =
    '-mx-2 -my-3.5 px-2 py-3.5 underline-offset-4 hover:underline'

  return (
    <div className="mt-6 w-full max-w-xl sm:mt-8">
      {preview}
      <p className="mt-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {details}
      </p>

      <FileNameField
        value={file.typed}
        onChange={file.setTyped}
        extension={file.extension}
      />

      <div className="mt-6 flex justify-center gap-2">
        <a
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          href={url}
          download={file.name}
        >
          {downloadLabel}
        </a>
        {shareable && (
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() =>
              shareFiles([new File([blob], file.name, { type: blob.type })])
            }
          >
            Share
          </button>
        )}
      </div>
      {more}

      {after}

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
