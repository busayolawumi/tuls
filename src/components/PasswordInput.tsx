import { useId, type Ref } from 'react'

// A box for a PDF's password (Protect PDF and Unlock PDF). "Show password",
// outside it, turns its dots into letters. Browsers aren't asked to save or
// suggest passwords: a PDF's password isn't a login to this site.

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  /** Whether the letters show, rather than dots. */
  shown: boolean
  /** The ids of hints or errors about it. */
  describedBy?: string
  invalid?: boolean
  ref?: Ref<HTMLInputElement>
}

export function PasswordInput({
  label,
  value,
  onChange,
  shown,
  describedBy,
  invalid = false,
  ref,
}: Props) {
  const id = useId()
  return (
    <div className="mt-4 w-full text-left">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        // 16px on phones: iPhones zoom the page in on smaller text boxes.
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-invalid:border-red-600 sm:text-sm dark:border-zinc-700 dark:aria-invalid:border-red-400"
      />
    </div>
  )
}

/** The "Show password" tick box, for one or two PasswordInputs. */
export function ShowPassword({
  shown,
  onChange,
  plural = false,
}: {
  shown: boolean
  onChange: (shown: boolean) => void
  plural?: boolean
}) {
  return (
    <label className="mt-3 flex w-fit items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <input
        type="checkbox"
        checked={shown}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-zinc-900 dark:accent-zinc-100"
      />
      {plural ? 'Show passwords' : 'Show password'}
    </label>
  )
}
