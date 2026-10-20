import { WordError, wordErrorKind } from './errors'
import type { Progress } from './progress'

/** A Word file, and the PDF's pages pdf2docx couldn't convert (from 1). */
export type Converted = { docx: Uint8Array<ArrayBuffer>; leftOut: number[] }
import type { CompressLevel, WorkerReply, WorkerRequest } from './worker'

// The page's side of the PDF to Word worker (worker.ts): one worker, one
// job at a time. A worker that crashes, often for want of memory, fails its
// jobs; stop() ends it at once, even mid-conversion.

// Each request's own fields, without the id send() adds.
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

type Job = {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
  onProgress?: (progress: Progress) => void
}

export class Converter {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  private lastId = 0
  private jobs = new Map<number, Job>()
  /** Set once the worker has crashed or been stopped. */
  stopped = false

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const job = this.jobs.get(data.id)
      if (!job) return
      if (data.type === 'progress') return job.onProgress?.(data.progress)
      this.jobs.delete(data.id)
      if (data.type === 'error') {
        job.reject(new WordError(wordErrorKind(data.error), data.error))
      } else {
        job.resolve(
          data.type === 'result'
            ? { docx: new Uint8Array(data.docx), leftOut: data.leftOut }
            : data.type === 'compressed'
              ? new Uint8Array(data.pdf)
              : null,
        )
      }
    }
    this.worker.onerror = (event) => {
      event.preventDefault()
      this.fail(
        new WordError(
          event.message ? wordErrorKind(event.message) : 'memory',
          event.message || 'The converter stopped',
        ),
      )
    }
  }

  private fail(error: WordError) {
    this.stopped = true
    for (const job of this.jobs.values()) job.reject(error)
    this.jobs.clear()
    this.worker.terminate()
  }

  private send<T>(
    request: WithoutId<WorkerRequest>,
    transfer: Transferable[] = [],
    onProgress?: Job['onProgress'],
  ) {
    if (this.stopped) {
      return Promise.reject(new WordError('unknown', 'Converter stopped'))
    }
    return new Promise<T>((resolve, reject) => {
      const id = ++this.lastId
      this.jobs.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
      })
      this.worker.postMessage({ ...request, id }, transfer)
    })
  }

  /**
   * Loads Python and the packages, or with `light`, only PyMuPDF (Compress
   * PDF). Without a saved engine, this includes the download.
   */
  start(light = false) {
    return this.send<void>({ type: 'start', light })
  }

  /** Makes a smaller copy of a PDF. Its bytes are handed over. */
  compress(pdf: ArrayBuffer, level: CompressLevel) {
    return this.send<Uint8Array<ArrayBuffer>>(
      { type: 'compress', pdf, level },
      [pdf],
    )
  }

  /** Makes a PDF into a Word file. The PDF's bytes are handed over. */
  toDocx(pdf: ArrayBuffer, onProgress: (progress: Progress) => void) {
    return this.send<Converted>({ type: 'convert', pdf }, [pdf], onProgress)
  }

  /** Ends the worker at once, even mid-conversion. */
  stop() {
    if (!this.stopped) this.fail(new WordError('unknown', 'Stopped'))
  }
}
