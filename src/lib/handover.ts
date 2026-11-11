// Files chosen on the home page, waiting for the tool picked for them. Moving
// to most tools keeps the page, so the files wait in memory. Word, Excel and
// PowerPoint to PDF load their page afresh, which empties memory, so for them
// the files wait in this browser's own storage until the new page takes them.

type Waiting = { tool: string; files: File[] }

// Stored as bytes: Safari won't store File objects in private browsing,
// and Firefox writes a File's contents later, so a page loading straight
// after can find it missing.
type Kept = {
  name: string
  type: string
  lastModified: number
  bytes: ArrayBuffer
}
type Saved = { tool: string; files: Kept[]; at: number }

const FLAG = 'tuls:handover'
const DATABASE = 'tuls-handover'
const STORE = 'files'
const KEY = 'waiting'
const FRESH_FOR = 120_000

let waiting: Promise<Waiting | undefined> | undefined

const settled = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Storage'))
  })

function openStore() {
  const request = indexedDB.open(DATABASE, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(STORE)
  return settled(request)
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openStore()
  try {
    const transaction = database.transaction(STORE, mode)
    // A write only counts once its transaction completes: Firefox drops it
    // if the page reloads straight after the request succeeds.
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error('Storage'))
    })
    // If the request fails, its own error is the one that counts.
    done.catch(() => {})
    const result = await settled(run(transaction.objectStore(STORE)))
    await done
    return result
  } finally {
    database.close()
  }
}

/** Keeps files for a tool reached without loading a new page. */
export function handOver(tool: string, files: File[]) {
  waiting = Promise.resolve({ tool, files })
}

/**
 * Keeps files for a tool whose page loads afresh. Returns false when the
 * browser won't store them (some private modes), so they have to be chosen
 * again there.
 */
export async function handOverAcrossLoad(tool: string, files: File[]) {
  try {
    const kept = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        lastModified: file.lastModified,
        bytes: await file.arrayBuffer(),
      })),
    )
    await withStore('readwrite', (store) =>
      store.put({ tool, files: kept, at: Date.now() } satisfies Saved, KEY),
    )
    sessionStorage.setItem(FLAG, '1')
    return true
  } catch {
    return false
  }
}

const asFile = (file: Kept) =>
  new File([file.bytes], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  })

async function fromStorage(): Promise<Waiting | undefined> {
  try {
    if (!sessionStorage.getItem(FLAG)) return undefined
    sessionStorage.removeItem(FLAG)
  } catch {
    return undefined
  }
  try {
    const saved = (await withStore('readonly', (store) => store.get(KEY))) as
      Saved | undefined
    await withStore('readwrite', (store) => store.delete(KEY))
    if (!saved || Date.now() - saved.at > FRESH_FOR) return undefined
    return { tool: saved.tool, files: saved.files.map(asFile) }
  } catch {
    return undefined
  }
}

/** The files waiting for this tool, if any. They stay until `forget`. */
export function handedFiles(tool: string) {
  waiting ??= fromStorage()
  return waiting.then((found) =>
    found?.tool === tool ? found.files : undefined,
  )
}

export function forgetHandedFiles() {
  waiting = Promise.resolve(undefined)
}
