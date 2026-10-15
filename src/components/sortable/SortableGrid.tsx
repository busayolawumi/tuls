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
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'

// A grid of cards that can be dragged into a new order: with a mouse, by
// touch (hold, then drag), or with a keyboard (Space, the arrow keys, Space).
// Screen readers hear what's picked up and where it goes.

/** No sliding about, for people who've asked for less motion. */
const Still = createContext(false)

type GridProps = {
  /** The cards' ids, in order. */
  ids: string[]
  /** The list's name for screen readers, e.g. "Pages, in order". */
  label: string
  /** What screen readers call a card while it moves, e.g. "Page 3". */
  nameOf: (id: string) => string
  /** What a card is, for the instructions, e.g. "page". */
  noun: string
  onMove: (id: string, to: string) => void
  /** The list itself, e.g. to move focus to it. */
  listRef?: Ref<HTMLOListElement>
  /** SortableCards, in the same order as `ids`. */
  children: ReactNode
}

export function SortableGrid({
  ids,
  label,
  nameOf,
  noun,
  onMove,
  listRef,
  children,
}: GridProps) {
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

  // What screen readers hear while a card is being moved.
  const name = (id: UniqueIdentifier) => nameOf(String(id))
  const position = (id: UniqueIdentifier) =>
    `position ${ids.indexOf(String(id)) + 1} of ${ids.length}`
  // A drag starts over the card's own place. Saying so straight away would
  // cut off "Picked up…", so stay quiet until the card has been moved.
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
    if (over && active.id !== over.id) {
      onMove(String(active.id), String(over.id))
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: `To move this ${noun}, press Space or Enter, move it with the arrow keys, then press Space or Enter to drop it. Escape cancels.`,
        },
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <Still value={still}>
          <ol
            ref={listRef}
            tabIndex={listRef ? -1 : undefined}
            aria-label={label}
            className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 outline-none sm:grid-cols-4"
          >
            {children}
          </ol>
        </Still>
      </SortableContext>
    </DndContext>
  )
}

type CardProps = {
  id: string
  /** While the tool is busy: nothing moves. */
  locked: boolean
  /** The drag handle's name, e.g. "Page 3, turned 90°". */
  label: string
  /** What's in the square, which is the drag handle: a thumbnail, badges. */
  children: ReactNode
  /** The strip under the square: a number, buttons. */
  footer: ReactNode
}

/** A card in a SortableGrid: a square to drag it by, and a footer. */
export function SortableCard({
  id,
  locked,
  label,
  children,
  footer,
}: CardProps) {
  const still = useContext(Still)
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: locked,
    transition: still ? null : undefined,
  })

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
        aria-label={label}
        className="relative aspect-square cursor-grab touch-manipulation rounded-t-lg select-none [-webkit-touch-callout:none] active:cursor-grabbing"
      >
        {children}
      </div>
      <div className="flex min-h-9 items-center justify-between border-t border-zinc-200 pl-2.5 dark:border-zinc-800">
        {footer}
      </div>
    </li>
  )
}
