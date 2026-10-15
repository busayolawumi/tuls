import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { Page } from './lib/pages'
import type { Pictures } from './usePagePictures'

// The pages as a grid of cards. Each can be dragged to a new place (mouse,
// touch, or keyboard: Space, the arrow keys, Space), turned, or marked to be
// deleted. Thumbnails are asked for as cards come near the screen.

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
  const sensors = useSensors(
    // A small move before a drag starts, so clicks on the buttons still work.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Touch and hold to drag, so a swipe still scrolls the page.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const [still] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  // One watcher for every card's thumbnail. Cards sign up their thumbnails
  // as they appear; the watcher is remade when want/unwant change (another
  // PDF), and picks up every signed-up thumbnail again.
  const watched = useRef(new Set<HTMLElement>())
  const watcher = useRef<IntersectionObserver>(undefined)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (entry.isIntersecting) want(index)
          else unwant(index)
        }
      },
      // Start drawing a little before a page scrolls into view.
      { rootMargin: '400px 0px' },
    )
    for (const element of watched.current) observer.observe(element)
    watcher.current = observer
    return () => {
      observer.disconnect()
      watcher.current = undefined
    }
  }, [want, unwant])
  const watch = useCallback((element: HTMLElement | null) => {
    if (!element) return
    watched.current.add(element)
    watcher.current?.observe(element)
    return () => {
      watched.current.delete(element)
      watcher.current?.unobserve(element)
    }
  }, [])

  // What screen readers hear while a page is being moved.
  const name = (id: UniqueIdentifier) =>
    `Page ${(pages.find((page) => page.id === id)?.index ?? 0) + 1}`
  const position = (id: UniqueIdentifier) =>
    `position ${pages.findIndex((page) => page.id === id) + 1} of ${pages.length}`
  // A drag starts over the page's own place. Saying so straight away would
  // cut off "Picked up…", so stay quiet until the page has been moved.
  const moved = useRef(false)
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      moved.current = false
      return `Picked up ${name(active.id)}. It’s at ${position(active.id)}.`
    },
    // undefined says nothing; '' would clear what was last said.
    onDragOver: ({ active, over }) => {
      if (!over) return undefined
      if (over.id === active.id && !moved.current) return undefined
      moved.current = true
      return `${name(active.id)} is over ${position(over.id)}.`
    },
    onDragEnd: ({ active, over }) =>
      over
        ? `${name(active.id)} dropped at ${position(over.id)}.`
        : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) =>
      `Moving cancelled. ${name(active.id)} is back at ${position(active.id)}.`,
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id)
      onMove(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move this page, press Space or Enter, move it with the arrow keys, then press Space or Enter to drop it. Escape cancels.',
        },
      }}
    >
      <SortableContext
        items={pages.map((page) => page.id)}
        strategy={rectSortingStrategy}
      >
        <ol
          aria-label="Pages, in order"
          className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 sm:grid-cols-4"
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
              still={still}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
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
  /** No sliding about, for people who've asked for less motion. */
  still: boolean
}

// Memoised, so a new thumbnail only redraws its own card.
const PageCard = memo(function PageCard({
  page,
  picture,
  watch,
  onTurn,
  onToggleDeleted,
  locked,
  still,
}: CardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: page.id,
    disabled: locked,
    transition: still ? null : undefined,
  })
  const number = page.index + 1
  const state = [
    page.turn ? `turned ${page.turn}°` : '',
    page.deleted ? 'to be deleted' : '',
  ].filter(Boolean)
  const iconButton =
    'grid size-9 place-items-center rounded-md text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative flex flex-col rounded-lg border bg-white dark:bg-zinc-950 ${
        isDragging
          ? 'z-10 scale-105 border-zinc-400 shadow-lg dark:border-zinc-500'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={[`Page ${number}`, ...state].join(', ')}
        className="relative aspect-square cursor-grab touch-manipulation rounded-t-lg select-none [-webkit-touch-callout:none] active:cursor-grabbing"
      >
        {/* A fixed square, so a page fits inside it whichever way it's
            turned, and every card is the same size. */}
        <div
          ref={watch}
          data-index={page.index}
          className="absolute inset-0 flex items-center justify-center p-3"
        >
          {picture ? (
            <img
              src={picture}
              alt=""
              draggable={false}
              style={{ transform: `rotate(${page.turn}deg)` }}
              className={`max-h-full max-w-full border border-zinc-200 shadow-sm motion-safe:transition-transform dark:border-zinc-700 ${
                page.deleted ? 'opacity-25 grayscale' : ''
              }`}
            />
          ) : (
            <span
              className={`aspect-[3/4] h-full rounded-sm bg-zinc-100 dark:bg-zinc-900 ${
                picture === undefined ? 'motion-safe:animate-pulse' : ''
              }`}
            />
          )}
        </div>
        {page.deleted && (
          <span className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Deleted
          </span>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-200 pl-2.5 dark:border-zinc-800">
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
            className={iconButton}
            disabled={locked}
            onClick={() => onTurn(page)}
            aria-label={`Rotate page ${number}`}
          >
            <Icon d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={locked}
            onClick={() => onToggleDeleted(page)}
            aria-label={
              page.deleted ? `Keep page ${number}` : `Delete page ${number}`
            }
          >
            {page.deleted ? (
              <Icon d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            ) : (
              <Icon d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
            )}
          </button>
        </div>
      </div>
    </li>
  )
})

function Icon({ d }: { d: string }) {
  return (
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
      <path d={d} />
    </svg>
  )
}
