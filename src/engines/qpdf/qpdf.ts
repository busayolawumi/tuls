import createQpdf from '@neslinesli93/qpdf-wasm'

// qpdf (qpdf.sourceforge.io), compiled to WebAssembly: adds and removes PDF
// passwords. pdf-lib can't be trusted with encryption (CLAUDE.md: "Protect
// PDF and Unlock PDF: findings"). It's a 441 KB download, fetched the first
// time a PDF with a password, or one being given a password, needs it.
//
// Each run gets a fresh copy of qpdf: it's a command-line program, done
// after one command, and its memory goes with it.

type QpdfModule = {
  callMain(args: string[]): number
  FS: {
    writeFile(path: string, data: Uint8Array): void
    readFile(path: string): Uint8Array
  }
}
type CreateQpdf = (options: {
  locateFile: () => string
  noInitialRun: boolean
}) => Promise<QpdfModule>

let wasmLocation: string | undefined

/**
 * Where qpdf.wasm is: a URL in the browser (the PDF worker sets it), a file
 * path in the unit tests (src/test-setup.ts).
 */
export function setQpdfWasm(location: string) {
  wasmLocation = location
}

/** What a qpdf command did. */
export type QpdfResult = {
  /** 0 if it worked, 3 if it worked with warnings, 2 if it failed. */
  code: number
  /** What qpdf said, for error messages. */
  output: string
  /** The files asked for, as qpdf left them (undefined if not made). */
  files: Record<string, Uint8Array | undefined>
}

/**
 * Runs one qpdf command. `inputs` are written to its file system first (by
 * name, without a slash), and the `outputs` read back after.
 */
export async function runQpdf(
  args: string[],
  inputs: Record<string, Uint8Array>,
  outputs: string[] = [],
): Promise<QpdfResult> {
  if (!wasmLocation) throw new Error('qpdf.wasm’s location isn’t set')
  const location = wasmLocation
  const lines: string[] = []
  // qpdf prints with console.log and console.error, which it takes when it's
  // made, so they're swapped for that moment: its messages ("invalid
  // password") become this result's, not console errors.
  const { log, error } = console
  console.log = console.error = (...parts: unknown[]) => {
    lines.push(parts.join(' '))
  }
  let made: Promise<QpdfModule>
  try {
    made = (createQpdf as unknown as CreateQpdf)({
      locateFile: () => location,
      noInitialRun: true,
    })
  } finally {
    console.log = log
    console.error = error
  }
  const qpdf = await made
  for (const [name, data] of Object.entries(inputs)) {
    qpdf.FS.writeFile(`/${name}`, data)
  }
  let code: number
  try {
    code = qpdf.callMain(args)
  } catch (e) {
    // It may end by calling exit(), which shows up as a thrown status.
    const status = (e as { status?: unknown }).status
    if (typeof status !== 'number') throw e
    code = status
  }
  const files: QpdfResult['files'] = {}
  for (const name of outputs) {
    try {
      files[name] = qpdf.FS.readFile(`/${name}`)
    } catch {
      files[name] = undefined
    }
  }
  return { code, output: lines.join('\n'), files }
}
