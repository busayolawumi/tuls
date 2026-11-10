import type { Ref } from 'react'

type Props = {
  label: string
  unit: string
  value: string
  onChange: (value: string) => void
  invalid: boolean
  problemId: string
  decimal?: boolean
  inputRef?: Ref<HTMLInputElement>
}

export function NumberBox({
  label,
  unit,
  value,
  onChange,
  invalid,
  problemId,
  decimal = false,
  inputRef,
}: Props) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          maxLength={6}
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? problemId : undefined}
          onChange={(event) =>
            onChange(
              event.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, ''),
            )
          }
          className="w-full min-w-0 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base font-normal sm:text-sm dark:border-zinc-700"
        />
        <span
          aria-hidden="true"
          className="font-normal text-zinc-500 dark:text-zinc-400"
        >
          {unit}
        </span>
      </span>
    </label>
  )
}
