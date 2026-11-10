import { useCallback, useRef, useState } from 'react'
import { useHandedFiles } from '../lib/useHandedFiles'
import { usePageDrop } from '../lib/usePageDrop'

// The way into a tool: drop files anywhere on the page, or browse for them.
// The same look and behaviour as Video to GIF's drop zone (Gify's), for
// tools that take other files or several at once.

type Props = {
  /** What to ask for, e.g. "PDFs" gives "Drop PDFs, or browse". */
  what: string
  /** The small print under it, e.g. "PDF · up to 200 MB each". */
  hint?: string
  /** For the file picker, e.g. "application/pdf,.pdf". */
  accept: string
  multiple?: boolean
  /** Says why a file can't be used, or returns undefined if it can. */
  check?: (file: File) => string | undefined
  onFiles: (files: File[]) => void
  /** A slimmer button, for adding more files to a list. */
  compact?: boolean
  /** Takes no files, for while the tool is busy. */
  disabled?: boolean
}

export function FileDrop({
  what,
  hint,
  accept,
  multiple = false,
  check,
  onFiles,
  compact = false,
  disabled = false,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<string[]>([])

  const choose = useCallback(
    (list: FileList | File[] | null | undefined) => {
      const files = [...(list ?? [])].slice(0, multiple ? undefined : 1)
      if (!files.length || disabled) return
      const good: File[] = []
      const found: string[] = []
      for (const file of files) {
        const problem = check?.(file)
        if (!problem) good.push(file)
        // With several files, say which one each problem is about.
        else found.push(files.length > 1 ? `${file.name}: ${problem}` : problem)
      }
      setProblems(found)
      if (good.length) onFiles(good)
    },
    [check, disabled, multiple, onFiles],
  )

  const dragging = usePageDrop(choose)
  useHandedFiles(choose)

  return (
    <div
      className={`flex w-full max-w-xl flex-col items-center ${compact ? 'mt-3' : 'mt-10'}`}
    >
      <button
        type="button"
        className={`flex w-full flex-col items-center gap-2 rounded-lg border border-dashed transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          compact ? 'px-4 py-4' : 'px-6 py-14'
        } ${
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-50 disabled:hover:border-zinc-300 disabled:hover:bg-transparent dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900'
        }`}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <span className={compact ? 'text-sm font-medium' : 'font-medium'}>
          {/* Phones and tablets can't drag files, so just offer the picker. */}
          <span className="pointer-coarse:hidden">
            {compact ? `Add more ${what}: drop them, or ` : `Drop ${what}, or `}
            <span className="text-link">browse</span>
          </span>
          <span className="hidden pointer-coarse:inline">
            {compact ? `Add more ${what}` : `Choose ${what}`}
          </span>
        </span>
        {hint && !compact && (
          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {hint}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          choose(e.target.files)
          // Lets the same file be chosen again after an error.
          e.target.value = ''
        }}
      />
      {problems.length > 0 && (
        <div
          role="alert"
          className="mt-3 text-sm text-red-600 dark:text-red-400"
        >
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {!compact && (
        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          Your files never leave your device.
        </p>
      )}
    </div>
  )
}
