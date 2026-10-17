/** Why a PDF couldn't be made into a Word file, so the page can say why. */
export type WordErrorKind =
  'password' | 'unreadable' | 'memory' | 'network' | 'stuck' | 'unknown'

export class WordError extends Error {
  kind: WordErrorKind
  constructor(kind: WordErrorKind, cause?: unknown) {
    super(`PDF to Word problem (${kind})`, { cause })
    this.kind = kind
  }
}

// Matched against the messages of PyMuPDF and pdf2docx (Python errors, as
// "Name: message"), Pyodide's and the browser's.
const PASSWORD = /password|encrypted/i
const NETWORK =
  /NetworkError|Failed to fetch|Load failed|dynamically imported module|Importing a module script failed/i
const MEMORY =
  /MemoryError|out of memory|Cannot enlarge memory|Array buffer allocation failed|Invalid array length|memory access out of bounds/i
const UNREADABLE =
  /FileDataError|Failed to open|cannot open|format error|no objects found|zero page|not a PDF|broken/i

export function wordErrorKind(error: unknown): WordErrorKind {
  if (error instanceof WordError) return error.kind
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (PASSWORD.test(text)) return 'password'
  if (NETWORK.test(text)) return 'network'
  if (MEMORY.test(text)) return 'memory'
  if (UNREADABLE.test(text)) return 'unreadable'
  return 'unknown'
}

/** A plain sentence for each kind, about the PDF that failed. */
export const WORD_ERROR_MESSAGES: Record<WordErrorKind, string> = {
  password:
    'It has a password. Remove the password in the app it came from, then try again.',
  unreadable: 'It couldn’t be opened. It may be damaged.',
  memory:
    'It needs more memory than this browser could give it. A shorter PDF, or a computer, should work.',
  network:
    'The converter couldn’t be downloaded. Check your connection, then try again.',
  stuck:
    'The converter took far too long with it. Try again, or try it on a computer.',
  unknown: 'Something went wrong converting it. Try again.',
}
