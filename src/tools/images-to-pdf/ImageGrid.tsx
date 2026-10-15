import { memo, type Ref } from 'react'
import { Icon } from '../../components/Icon'
import { ICON_BUTTON, ICONS } from '../../components/iconPaths'
import { PageThumb } from '../../components/pdf/PageThumb'
import {
  SortableCard,
  SortableGrid,
} from '../../components/sortable/SortableGrid'

// The images as a grid of cards, in the order of the pages. Each can be
// dragged to a new place, turned, or removed.

/** An image chosen for the PDF. */
export type Item = {
  id: string
  file: File
  /** Not drawn yet (undefined), or couldn't be opened (null). */
  picture?: string | null
  /** Degrees clockwise. */
  turn: number
}

type Props = {
  items: Item[]
  onMove: (id: string, to: string) => void
  onTurn: (item: Item) => void
  onRemove: (item: Item) => void
  /** While making the PDF: nothing can change. */
  locked: boolean
  listRef: Ref<HTMLOListElement>
}

export function ImageGrid({
  items,
  onMove,
  onTurn,
  onRemove,
  locked,
  listRef,
}: Props) {
  const nameOf = (id: string) =>
    items.find((item) => item.id === id)?.file.name ?? 'Image'

  return (
    <SortableGrid
      ids={items.map((item) => item.id)}
      label="Images, in page order"
      nameOf={nameOf}
      noun="image"
      onMove={onMove}
      listRef={listRef}
    >
      {items.map((item, index) => (
        <ImageCard
          key={item.id}
          item={item}
          position={index + 1}
          onTurn={onTurn}
          onRemove={onRemove}
          locked={locked}
        />
      ))}
    </SortableGrid>
  )
}

type CardProps = {
  item: Item
  position: number
  onTurn: (item: Item) => void
  onRemove: (item: Item) => void
  locked: boolean
}

// Memoised, so a new thumbnail only redraws its own card.
const ImageCard = memo(function ImageCard({
  item,
  position,
  onTurn,
  onRemove,
  locked,
}: CardProps) {
  const name = item.file.name
  const state = [
    item.turn ? `turned ${item.turn}°` : '',
    item.picture === null ? 'can’t be opened' : '',
  ].filter(Boolean)

  return (
    <SortableCard
      id={item.id}
      locked={locked}
      label={[name, ...state].join(', ')}
      footer={
        <>
          <span
            aria-hidden="true"
            className="font-mono text-xs text-zinc-500 dark:text-zinc-400"
          >
            {position}
          </span>
          <div className="flex">
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={locked || item.picture === null}
              onClick={() => onTurn(item)}
              aria-label={`Rotate ${name}`}
            >
              <Icon d={ICONS.rotate} />
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              disabled={locked}
              onClick={() => onRemove(item)}
              aria-label={`Remove ${name}`}
            >
              <Icon d={ICONS.remove} />
            </button>
          </div>
        </>
      }
    >
      {item.picture === null ? (
        <p className="absolute inset-0 grid place-items-center p-3 text-center text-xs text-red-600 dark:text-red-400">
          Can’t open this image
        </p>
      ) : (
        <PageThumb picture={item.picture} turn={item.turn} />
      )}
    </SortableCard>
  )
})
