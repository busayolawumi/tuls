import { memo } from 'react'
import { PageThumb } from '../../components/pdf/PageThumb'
import type { Pictures } from '../../components/pdf/usePagePictures'
import { useWatchPages } from '../../components/pdf/useWatchPages'
import type { Cuts } from './lib/parts'

// The pages as a grid of cards, each with scissors to split after it. A
// split shows as a dashed line after the page, and each part's first page
// is labelled "Part 2" and so on. Thumbnails are asked for as cards come
// near the screen.

type Props = {
  count: number
  cuts: Cuts
  pictures: Pictures
  /** Called as a page comes near the screen, and as it leaves. */
  want: (index: number) => void
  unwant: (index: number) => void
  /** `cut` is whether there was a split after the page before. */
  onToggleCut: (index: number, cut: boolean) => void
  /** While splitting: nothing can change. */
  locked: boolean
}

export function SplitGrid({
  count,
  cuts,
  pictures,
  want,
  unwant,
  onToggleCut,
  locked,
}: Props) {
  const watch = useWatchPages(want, unwant)

  // The part each page starts, if it starts one. Only shown once there's
  // more than one part.
  const starts = new Map<number, number>()
  if (cuts.size > 0) {
    starts.set(0, 1)
    for (let index = 0; index < count - 1; index++) {
      if (cuts.has(index)) starts.set(index + 1, starts.size + 1)
    }
  }

  return (
    <ol
      aria-label="Pages"
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 sm:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <SplitCard
          key={index}
          index={index}
          last={index === count - 1}
          cut={cuts.has(index)}
          part={starts.get(index)}
          picture={pictures.get(index)}
          watch={watch}
          onToggleCut={onToggleCut}
          locked={locked}
        />
      ))}
    </ol>
  )
}

type CardProps = {
  index: number
  /** The last page, which can't be split after. */
  last: boolean
  /** Whether there's a split after this page. */
  cut: boolean
  /** The part this page starts, if it starts one. */
  part: number | undefined
  picture: string | null | undefined
  watch: (element: HTMLElement | null) => void
  onToggleCut: (index: number, cut: boolean) => void
  locked: boolean
}

// Memoised, so a new thumbnail only redraws its own card.
const SplitCard = memo(function SplitCard({
  index,
  last,
  cut,
  part,
  picture,
  watch,
  onToggleCut,
  locked,
}: CardProps) {
  const number = index + 1
  return (
    <li className="relative flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="relative aspect-square">
        <PageThumb index={index} picture={picture} watch={watch} />
        {part && (
          <span className="absolute top-1.5 left-1.5 rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Part {part}
          </span>
        )}
      </div>
      <div className="flex min-h-9 items-center justify-between border-t border-zinc-200 pl-2.5 dark:border-zinc-800">
        <span
          aria-hidden="true"
          className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
        >
          {number}
        </span>
        <span className="sr-only">Page {number}</span>
        {!last && (
          <button
            type="button"
            aria-pressed={cut}
            aria-label={`Split after page ${number}`}
            disabled={locked}
            onClick={() => onToggleCut(index, cut)}
            className={`grid size-9 place-items-center rounded-md transition disabled:opacity-30 ${
              cut
                ? 'bg-orange-50 text-link dark:bg-orange-950/50'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-[1.125rem]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M8.1 8.1 12 12M20 4 8.1 15.9M14.8 14.8 20 20" />
            </svg>
          </button>
        )}
      </div>
      {/* The split itself: a dashed line in the gap after the page. */}
      {cut && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 -right-[7px] border-r-2 border-dashed border-accent"
        />
      )}
    </li>
  )
})
