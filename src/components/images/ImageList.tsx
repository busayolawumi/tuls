import { formatSize } from '../../lib/format'
import { MAX_IMAGES } from '../../tools/images-to-pdf/lib/images'

const SHOWN = 6

type Props = {
  files: File[]
  leftOut: number
}

export function ImageList({ files, leftOut }: Props) {
  return (
    <>
      <ul
        aria-label="The images"
        className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      >
        {files.slice(0, SHOWN).map((file, i) => (
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
        {files.length > SHOWN && (
          <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            and {files.length - SHOWN} more
          </li>
        )}
      </ul>
      {leftOut > 0 && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Up to {MAX_IMAGES} images can go in at once, so {leftOut}{' '}
          {leftOut === 1 ? 'was' : 'were'} left out.
        </p>
      )}
    </>
  )
}
