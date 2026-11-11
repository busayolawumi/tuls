/** Why text recognition failed, so the page can say why. */
export type OcrErrorKind = 'memory' | 'network' | 'stuck' | 'unknown'

export class OcrError extends Error {
  kind: OcrErrorKind
  constructor(kind: OcrErrorKind, cause?: unknown) {
    super(`Text recognition problem (${kind})`, { cause })
    this.kind = kind
  }
}

const NETWORK =
  /NetworkError|Failed to fetch|Load failed|Network error|dynamically imported module|Importing a module script failed|importScripts/i
const MEMORY =
  /out of memory|Cannot enlarge memory|Array buffer allocation failed|Invalid array length|memory access out of bounds|Aborted\(OOM\)/i

export function ocrErrorKind(error: unknown): OcrErrorKind {
  if (error instanceof OcrError) return error.kind
  const text =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (NETWORK.test(text)) return 'network'
  if (MEMORY.test(text)) return 'memory'
  return 'unknown'
}

export const OCR_ERROR_MESSAGES: Record<OcrErrorKind, string> = {
  memory:
    'It needs more memory than this browser could give it. A shorter PDF, or a computer, should work.',
  network:
    'The text reader couldn’t be downloaded. Check your connection, then try again.',
  stuck:
    'The text reader took far too long with it. Try again, or try it on a computer.',
  unknown: 'Something went wrong reading it. Try again.',
}
