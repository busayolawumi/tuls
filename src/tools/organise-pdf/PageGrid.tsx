import { memo } from 'react'
import { Icon } from '../../components/Icon'
import { ICON_BUTTON, ICONS } from '../../components/iconPaths'
import { PageThumb } from '../../components/pdf/PageThumb'
import type { Pictures } from '../../components/pdf/usePagePictures'
import { useWatchPages } from '../../components/pdf/useWatchPages'
import {
  SortableCard,
  SortableGrid,
} from '../../components/sortable/SortableGrid'
import type { Page } from './lib/pages'

// The pages as a grid of cards. Each can be dragged to a new place, turned,
// or marked to be deleted. Thumbnails are asked for as cards come near the
// screen.

type Props = {
  pages: Page[]
  pictures: Pictures
  /** Called as a page comes near the screen, and as it leaves. */
  want: (index: number) => void
  unwant: (index: number) => void
  onMove: (id: string, to: string) => void
  onTurn: (page: Page) => void
  onToggleDeleted: (page: Page) => void
  /** While saving: nothing can change. */
  locked: boolean
}

export function PageGrid({
  pages,
  pictures,
  want,
  unwant,
  onMove,
  onTurn,
  onToggleDeleted,
  locked,
}: Props) {
  const watch = useWatchPages(want, unwant)
  const nameOf = (id: string) =>
    `Page ${(pages.find((page) => page.id === id)?.index ?? 0) + 1}`

  return (
    <SortableGrid
      ids={pages.map((page) => page.id)}
      label="Pages, in order"
      nameOf={nameOf}
      noun="page"
      onMove={onMove}
    >
      {pages.map((page) => (
        <PageCard
          key={page.id}
          page={page}
          picture={pictures.get(page.index)}
          watch={watch}
          onTurn={onTurn}
          onToggleDeleted={onToggleDeleted}
          locked={locked}
        />
      ))}
    </SortableGrid>
  )
}

type CardProps = {
  page: Page
  /** Not drawn yet (undefined), or couldn't be drawn (null). */
  picture: string | null | undefined
  watch: (element: HTMLElement | null) => void
  onTurn: (page: Page) => void
  onToggleDeleted: (page: Page) => void
  locked: boolean
}

// Memoised, so a new thumbnail only redraws its own card.
const PageCard = memo(function PageCard({
  page,
  picture,
  watch,
  onTurn,
  onToggleDeleted,
  locked,
}: CardProps) {
  const number = page.index + 1
  const state = [
    page.turn ? `turned ${page.turn}°` : '',
    page.deleted ? 'to be deleted' : '',
  ].filter(Boolean)

  return (
    <SortableCard
      id={page.id}
      locked={locked}
      label={[`Page ${number}`, ...state].join(', ')}
      footer={
        <>
          <span
            aria-hidden="true"
            className={`font-mono text-xs text-zinc-500 dark:text-zinc-400 ${
              page.deleted ? 'line-through' : ''
            }`}
          >
            {number}
          </span>
          <div className="flex">
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={locked}
              onClick={() => onTurn(page)}
              aria-label={`Rotate page ${number}`}
            >
              <Icon d={ICONS.rotate} />
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={locked}
              onClick={() => onToggleDeleted(page)}
              aria-label={
                page.deleted ? `Keep page ${number}` : `Delete page ${number}`
              }
            >
              <Icon d={page.deleted ? ICONS.undo : ICONS.delete} />
            </button>
          </div>
        </>
      }
    >
      <PageThumb
        index={page.index}
        picture={picture}
        watch={watch}
        turn={page.turn}
        faded={page.deleted}
      />
      {page.deleted && (
        <span className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Deleted
        </span>
      )}
    </SortableCard>
  )
})
