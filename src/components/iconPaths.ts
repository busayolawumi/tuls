// Small line icons for buttons, on a 24 × 24 grid. Each is the path's `d`.
export const ICONS = {
  /** A quarter turn clockwise. */
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  /** A bin. */
  delete:
    'M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  /** An arrow back, for undoing. */
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  /** A cross. */
  remove: 'M6 6l12 12M18 6L6 18',
}

/** The style for a square icon button in a card's footer. */
export const ICON_BUTTON =
  'grid size-9 place-items-center rounded-md text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800'
