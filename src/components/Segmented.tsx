// A small set of choices, one of which is picked, styled as joined buttons.
// Underneath it's a group of radio buttons, so keyboards (the arrow keys)
// and screen readers treat it as one.

type Props<T extends string> = {
  /** What's being chosen, e.g. "Page size". */
  legend: string
  /** The radio group's name; unique on the page. */
  name: string
  options: [value: T, label: string][]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}

export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
}: Props<T>) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <legend className="sr-only">{legend}</legend>
      <span
        aria-hidden="true"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        {legend}
      </span>
      <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
        {options.map(([option, label]) => (
          <label
            key={option}
            className="cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors has-checked:bg-zinc-900 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-default has-disabled:opacity-50 dark:has-checked:bg-zinc-100 dark:has-checked:text-zinc-900"
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
