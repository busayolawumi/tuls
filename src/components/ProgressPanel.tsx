// What a long job is doing, how far it's got (if it can tell), a note under
// the bar, and Cancel. Used by the converters with big engines.

type Props = {
  /** What's happening, e.g. "Converting report.pdf…". */
  label: string
  /** 0–1, or undefined while it can't tell (the bar pulses instead). */
  ratio?: number
  /** A line under the bar, e.g. the download's size. */
  note?: string
  onCancel: () => void
}

export function ProgressPanel({ label, ratio, note, onCancel }: Props) {
  const percent = ratio === undefined ? undefined : Math.round(ratio * 100)
  return (
    <div className="mt-10 w-full max-w-xl text-left">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p role="status" className="min-w-0 truncate">
          {label}
        </p>
        {percent !== undefined && (
          <p className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {percent}%
          </p>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Converting"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900"
      >
        {percent === undefined ? (
          <div className="h-full w-full bg-accent/40 motion-safe:animate-pulse" />
        ) : (
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
        <button
          type="button"
          className="-mx-2 -my-3.5 px-2 py-3.5 text-xs text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
