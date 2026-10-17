import { unzipSync } from 'fflate'
import { engineFile } from './download'
import { OfficeError, officeErrorKind } from './errors'

// Talks to @matbee/libreoffice-converter's worker, which runs LibreOffice
// and its threads. Tuls has its own client rather than the package's
// WorkerBrowserConverter, which waits forever if the worker gets stuck or
// crashes, and can't stop a stuck one (its destroy() waits for a reply).
// The messages are the package's (version pinned in package.json).

type Reply =
  | { type: 'loaded' }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; data: Uint8Array }
  | { type: 'error'; id: number; error?: string }
  | { type: 'progress'; id: number }

type Job = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

// The worker announces itself with "loaded" before it takes messages.
const LOADED = 0

// LibreOffice's PDF export settings, in its JSON form. Comments would
// otherwise become sticky notes in the PDF, with the reviewers' names.
const PDF_OPTIONS = JSON.stringify({
  ExportNotes: { type: 'boolean', value: 'false' },
  ExportNotesInMargin: { type: 'boolean', value: 'false' },
})

export class Converter {
  private worker: Worker
  private lastId = LOADED
  private jobs = new Map<number, Job>()
  private loaded: Promise<unknown>
  /** Set once the worker has crashed or been stopped. */
  stopped = false

  constructor() {
    // A classic worker: it loads LibreOffice with importScripts.
    this.worker = new Worker(__LIBREOFFICE__.worker)
    this.loaded = new Promise((resolve, reject) =>
      this.jobs.set(LOADED, { resolve, reject }),
    )
    this.worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      const id = data.type === 'loaded' ? LOADED : data.id
      const job = this.jobs.get(id)
      if (!job || data.type === 'progress') return
      this.jobs.delete(id)
      if (data.type === 'error') {
        job.reject(new OfficeError(officeErrorKind(data.error), data.error))
      } else {
        job.resolve(data.type === 'result' ? data.data : undefined)
      }
    }
    // A crash, often running out of memory, ends every job.
    this.worker.onerror = (event) => {
      event.preventDefault()
      this.fail(
        new OfficeError(
          officeErrorKind(event.message),
          event.message || 'The converter stopped',
        ),
      )
    }
  }

  private fail(error: OfficeError) {
    this.stopped = true
    for (const job of this.jobs.values()) job.reject(error)
    this.jobs.clear()
    this.worker.terminate()
  }

  private send<T>(
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ) {
    if (this.stopped) {
      return Promise.reject(new OfficeError('unknown', 'Converter stopped'))
    }
    return new Promise<T>((resolve, reject) => {
      const id = ++this.lastId
      this.jobs.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.worker.postMessage({ ...message, id }, transfer)
    })
  }

  /** Loads LibreOffice. On a first visit this includes the download. */
  async start() {
    // Extra fonts, which LibreOffice finds with its own: a Symbol font for
    // Word's bullets (plugins/libreoffice-fonts/README.md), the font
    // settings, and Tuls's free fonts (plugins/libreoffice-fonts/free.ts).
    const [extra, pack] = await Promise.all([
      Promise.all(
        __LIBREOFFICE__.fonts.map(async ({ url, name }) => {
          const response = await fetch(url)
          if (!response.ok) throw new OfficeError('network', url)
          return {
            filename: name,
            data: new Uint8Array(await response.arrayBuffer()),
          }
        }),
      ),
      engineFile(__LIBREOFFICE__.fontPack).then(async (response) =>
        Object.entries(
          unzipSync(new Uint8Array(await response.arrayBuffer())),
        ).map(([filename, data]) => ({ filename, data })),
      ),
    ])
    const fonts = [...extra, ...pack]
    await this.loaded
    await this.send(
      {
        type: 'init',
        sofficeJs: __LIBREOFFICE__.soffice,
        sofficeWasm: __LIBREOFFICE__.wasm,
        sofficeData: __LIBREOFFICE__.data,
        sofficeWorkerJs: __LIBREOFFICE__.sofficeWorker,
        enableProgressTracking: false,
        verbose: false,
        fonts,
      },
      // Each buffer once: files from one ZIP may share one.
      [...new Set(fonts.map((font) => font.data.buffer))],
    )
  }

  /**
   * Converts a document, e.g. a .docx (`extension` "docx"), to PDF. The
   * bytes are handed over, not copied. `language` is a language tag such as
   * "en-GB", for what Office leaves to the computer's settings (the paper
   * of spreadsheets that don't say, and "short date" formats).
   */
  toPdf(bytes: Uint8Array<ArrayBuffer>, extension: string, language?: string) {
    return this.send<Uint8Array>(
      {
        type: 'convert',
        inputData: bytes,
        inputExt: extension,
        outputFormat: 'pdf',
        filterOptions: PDF_OPTIONS,
        language,
      },
      [bytes.buffer],
    )
  }

  /** Ends the worker at once, even mid-conversion. */
  stop() {
    if (!this.stopped) this.fail(new OfficeError('unknown', 'Stopped'))
  }
}
