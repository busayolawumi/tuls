import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

type Props = {
  before: string
  after: string
  width: number
  height: number
  /** The image's name, for screen readers. */
  name: string
}

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

const KEYS: Record<string, (value: number) => number> = {
  ArrowLeft: (value) => value - 5,
  ArrowDown: (value) => value - 5,
  ArrowRight: (value) => value + 5,
  ArrowUp: (value) => value + 5,
  PageDown: (value) => value - 20,
  PageUp: (value) => value + 20,
  Home: () => 0,
  End: () => 100,
}

export function CompareSlider({ before, after, width, height, name }: Props) {
  const [split, setSplit] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function follow(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect?.width) return
    setSplit(clamp(((clientX - rect.left) / rect.width) * 100))
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    follow(event.clientX)
  }

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    const next = KEYS[event.key]
    if (!next) return
    event.preventDefault()
    setSplit((value) => clamp(next(value)))
  }

  const stop = () => {
    dragging.current = false
  }

  return (
    <div
      ref={box}
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => dragging.current && follow(event.clientX)}
      onPointerUp={stop}
      onPointerCancel={stop}
      className="relative mx-auto max-w-full cursor-ew-resize touch-pan-y overflow-hidden rounded border border-zinc-200 bg-zinc-100 select-none dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, calc(18rem * ${width / height}))`,
      }}
    >
      <img
        src={after}
        alt={`The compressed ${name}`}
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
      <img
        src={before}
        alt=""
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <span className="pointer-events-none absolute top-2 left-2 rounded bg-zinc-900/70 px-1.5 py-0.5 text-xs text-white">
        Before
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-zinc-900/70 px-1.5 py-0.5 text-xs text-white">
        After
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_2px_rgba(0,0,0,0.6)]"
        style={{ left: `${split}%` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Before and after for ${name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={split}
        aria-valuetext={`${split}% showing before`}
        onKeyDown={handleKey}
        className="absolute top-1/2 flex size-9 -translate-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ left: `${split}%` }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
        </svg>
      </div>
    </div>
  )
}
