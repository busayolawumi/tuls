import { PdfError, pdfErrorKind } from './errors'
import type { PagePlan } from './organise'
import type { WorkerRequest, WorkerResponse } from './worker'

// Talks to the PDF worker. It's started the first time it's needed and kept
// for later jobs.

let worker: Worker | undefined
let lastId = 0
const pending = new Map<
  number,
  { resolve: (result: Uint8Array) => void; reject: (error: unknown) => void }
>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      const job = pending.get(data.id)
      if (!job) return
      pending.delete(data.id)
      if (data.ok) job.resolve(data.result)
      else job.reject(new PdfError(data.kind, data.message))
    }
    // A crash (often running out of memory) ends every job, and the next one
    // gets a fresh worker.
    worker.onerror = (event) => {
      for (const job of pending.values()) {
        job.reject(new PdfError(pdfErrorKind(event.message), event.message))
      }
      pending.clear()
      worker?.terminate()
      worker = undefined
    }
  }
  return worker
}

/** Sends a job to the worker. The `transfer` buffers are handed over, not copied. */
function run(
  request: (id: number) => WorkerRequest,
  transfer: ArrayBuffer[],
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const id = ++lastId
    pending.set(id, { resolve, reject })
    getWorker().postMessage(request(id), transfer)
  })
}

/** Merges PDFs in the background. The buffers are handed over, not copied. */
export function mergePdfsInBackground(files: ArrayBuffer[]) {
  return run((id) => ({ id, op: 'merge', files }), files)
}

/** Organises a PDF's pages in the background. The buffer is handed over. */
export function organisePdfInBackground(file: ArrayBuffer, plan: PagePlan[]) {
  return run((id) => ({ id, op: 'organise', file, plan }), [file])
}
