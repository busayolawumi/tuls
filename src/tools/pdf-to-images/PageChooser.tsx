import { memo } from 'react'
import { PageThumb } from '../../components/pdf/PageThumb'
import type { Pictures } from '../../components/pdf/usePagePictures'
import { useWatchPages } from '../../components/pdf/useWatchPages'

// The pages as a grid of cards to tick: a ticked page becomes an image.
// Tapping anywhere on a card ticks or unticks it. Thumbnails are asked for
// as cards come near the screen.

type Props = {
  count: number
  chosen: ReadonlySet<number>
  pictures: Pictures
  /** Called as a page comes near the screen, and as it leaves. */
  want: (index: number) => void
  unwant: (index: number) => void
  onToggle: (index: number) => void
  /** While making images: nothing can change. */
  locked: boolean
}

export function PageChooser({
  count,
  chosen,
  pictures,
  want,
  unwant,
  onToggle,
  locked,
}: Props) {
  const watch = useWatchPages(want, unwant)
  return (
    <ul
      aria-label="Pages"
      className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 sm:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <PageCard
          key={index}
          index={index}
          checked={chosen.has(index)}
          picture={pictures.get(index)}
          watch={watch}
          onToggle={onToggle}
          locked={locked}
        />
      ))}
    </ul>
  )
}

type CardProps = {
  index: number
  checked: boolean
  picture: string | null | undefined
  watch: (element: HTMLElement | null) => void
  onToggle: (index: number) => void
  locked: boolean
}

// Memoised, so a new thumbnail only redraws its own card.
const PageCard = memo(function PageCard({
  index,
  checked,
  picture,
  watch,
  onToggle,
  locked,
}: CardProps) {
  const number = index + 1
  return (
    <li
      className={`rounded-lg border transition-colors ${
        checked
          ? 'border-zinc-300 dark:border-zinc-700'
          : 'border-dashed border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <label
        className={`flex flex-col rounded-lg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
          locked ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <div className="relative aspect-square">
          <PageThumb
            index={index}
            picture={picture}
            watch={watch}
            faded={!checked}
          />
        </div>
        <div className="flex min-h-9 items-center justify-between border-t border-zinc-200 px-2.5 dark:border-zinc-800">
          <span
            aria-hidden="true"
            className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
          >
            {number}
          </span>
          <input
            type="checkbox"
            checked={checked}
            disabled={locked}
            onChange={() => onToggle(index)}
            aria-label={`Page ${number}`}
            className="size-[1.125rem] accent-accent outline-none"
          />
        </div>
      </label>
    </li>
  )
})
