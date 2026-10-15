/**
 * A page's thumbnail, centred in a fixed frame, so it fits whichever way
 * it's turned and every card is the same size. It fills its parent, which
 * must be `relative` and have a size (e.g. `aspect-square`).
 */
export function PageThumb({
  index,
  picture,
  watch,
  turn = 0,
  faded = false,
}: {
  /** The page, numbered from 0, for `watch`. */
  index?: number
  /** Not drawn yet (undefined), or couldn't be drawn (null). */
  picture: string | null | undefined
  /** From useWatchPages, so the picture is asked for near the screen. */
  watch?: (element: HTMLElement | null) => void
  /** Degrees clockwise. */
  turn?: number
  /** Faded out, e.g. for a page that's going. */
  faded?: boolean
}) {
  return (
    <div
      ref={watch}
      data-index={index}
      className="absolute inset-0 flex items-center justify-center p-3"
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          draggable={false}
          style={{ transform: `rotate(${turn}deg)` }}
          className={`max-h-full max-w-full border border-zinc-200 shadow-sm motion-safe:transition-transform dark:border-zinc-700 ${
            faded ? 'opacity-25 grayscale' : ''
          }`}
        />
      ) : (
        <span
          className={`aspect-3/4 h-full rounded-sm bg-zinc-100 dark:bg-zinc-900 ${
            picture === undefined ? 'motion-safe:animate-pulse' : ''
          }`}
        />
      )}
    </div>
  )
}
