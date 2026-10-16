/** Why a document couldn't be converted, so a tool can say something useful. */
export type OfficeErrorKind =
  | 'password'
  | 'unreadable'
  | 'memory'
  | 'network'
  | 'stuck'
  | 'unsupported'
  | 'unknown'

export class OfficeError extends Error {
  kind: OfficeErrorKind
  constructor(kind: OfficeErrorKind, cause?: unknown) {
    super(`Document problem (${kind})`, { cause })
    this.kind = kind
  }
}

// Matched against the converter's error messages (LibreOffice's, the
// converter worker's and the browser's).
const PASSWORD = /password|encrypt/i
const NETWORK = /Network ?Error|Failed to fetch|Load failed/i
const MEMORY =
  /out of memory|\bOOM\b|Cannot enlarge memory|Array buffer allocation failed|Invalid array length|memory access out of bounds/i
const UNREADABLE =
  /Failed to load document|Empty document|produced empty output|General (input\/output )?Error|corrupt/i

export function officeErrorKind(error: unknown): OfficeErrorKind {
  if (error instanceof OfficeError) return error.kind
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (PASSWORD.test(text)) return 'password'
  if (NETWORK.test(text)) return 'network'
  if (MEMORY.test(text)) return 'memory'
  if (UNREADABLE.test(text)) return 'unreadable'
  return 'unknown'
}

/** A plain sentence for each kind, about the document that failed. */
export const OFFICE_ERROR_MESSAGES: Record<OfficeErrorKind, string> = {
  password:
    'It has a password. Remove the password in the app it came from, then try again.',
  unreadable:
    'It couldn’t be opened. It may be damaged, or another kind of file.',
  memory:
    'It needs more memory than this browser could give it. A smaller document, or a computer, should work.',
  network:
    'The converter couldn’t be downloaded. Check your connection, then try again.',
  stuck:
    'The converter got stuck on it, even after starting again. Try again, or try it on a computer.',
  unsupported: 'Tuls can’t convert this kind of file.',
  unknown: 'Something went wrong converting it. Try again.',
}
