// A small line icon, from one of the paths in iconPaths.ts.
export function Icon({
  d,
  className = 'size-[1.125rem]',
}: {
  d: string
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
