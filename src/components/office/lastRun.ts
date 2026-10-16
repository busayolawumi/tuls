// Phones kill a browser tab that runs out of memory, and LibreOffice can
// need a lot. The page can't catch that, but it can leave a note before
// converting and remove it after: a note still there on the next visit means
// the page closed mid-conversion. Only the time is kept, nothing about the
// file.

const KEY = 'tuls:office:converting'
// An older note is from a different occasion, not worth mentioning.
const RECENT = 24 * 60 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage, if the browser lets Tuls use it. */
function storage(): Store | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export function markConverting(store = storage(), now = Date.now()) {
  try {
    store?.setItem(KEY, String(now))
  } catch {
    // Without the note, a closed page just isn't explained next time.
  }
}

export function markDone(store = storage()) {
  try {
    store?.removeItem(KEY)
  } catch {
    // As above.
  }
}

/** Whether the last visit closed mid-conversion. Asking clears the note. */
export function closedWhileConverting(store = storage(), now = Date.now()) {
  try {
    const at = Number(store?.getItem(KEY))
    store?.removeItem(KEY)
    return at > 0 && now - at < RECENT
  } catch {
    return false
  }
}
