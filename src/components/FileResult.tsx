import { useMemo, type ReactNode } from 'react'

// A finished file: a preview, its details, Download and (where the browser
// can) Share, and links to go back or start over. Video to GIF's result
// screen (Gify's) in a form any tool can use.

type Action = { label: string; onClick: () => void }

type Props = {
  blob: Blob
  /** An object URL for `blob`. */
  url: string
  /** The download name, e.g. report-merged.pdf. */
  name: string
  /** The button's words, e.g. "Download PDF". */
  downloadLabel: string
  /** A short line under the preview, e.g. "12 pages · 2.4 MB". */
  details: string
  preview?: ReactNode
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
  back,
  startOver,
}: Props) {
  // Only some browsers (mostly on phones) can share files. Where they can't,
  // the Share button doesn't appear.
  const shareable = useMemo(() => {
    const file = new File([blob], name, { type: blob.type })
    return navigator.canShare?.({ files: [file] }) ? file : undefined
  }, [blob, name])

  async function handleShare() {
    if (!shareable) return
    try {
      await navigator.share({ files: [shareable] })
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
    <div className="mt-6 w-full max-w-xl sm:mt-8">
      {preview}
      <p className="mt-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {details}
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <a
          className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          href={url}
          download={name}
        >
          {downloadLabel}
        </a>
        {shareable && (
          <button
            type="button"
            className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={handleShare}
          >
            Share
          </button>
        )}
      </div>

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
