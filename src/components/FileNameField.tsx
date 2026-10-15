import { useId } from 'react'

// Where the file's name can be changed before it's saved. The extension
// sits after the box and can't be changed, so a file is never saved as
// the wrong type.

type Props = {
  value: string
  onChange: (value: string) => void
  /** Shown after the box, e.g. ".pdf". */
  extension?: string
  label?: string
  disabled?: boolean
}

export function FileNameField({
  value,
  onChange,
  extension,
  label = 'File name',
  disabled = false,
}: Props) {
  const id = useId()
  return (
    <div className="mx-auto mt-4 w-full max-w-sm text-left">
      <label htmlFor={id} className="text-xs text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <div className="mt-1 flex items-center rounded-lg border border-zinc-300 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:opacity-50 dark:border-zinc-700">
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="done"
          // 16px on phones: iPhones zoom the page in on smaller text boxes.
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-base outline-none sm:text-sm"
        />
        {extension && (
          <span className="pr-3 text-base text-zinc-500 sm:text-sm dark:text-zinc-400">
            {extension}
          </span>
        )}
      </div>
    </div>
  )
}
