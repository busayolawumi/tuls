// Runs PDF work in a background thread, so the page stays responsive with
// big files. Started by client.ts.
import { pdfErrorKind } from './errors'
import { mergePdfs } from './merge'
import { organisePdf, type PagePlan } from './organise'
import { splitPdf, type SplitPart, type SplitResult } from './split'

export type WorkerRequest =
  | { id: number; op: 'merge'; files: ArrayBuffer[] }
  | { id: number; op: 'organise'; file: ArrayBuffer; plan: PagePlan[] }
  | { id: number; op: 'split'; file: ArrayBuffer; parts: SplitPart[] }
export type WorkerResult = Uint8Array | SplitResult
export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | {
      id: number
      ok: false
      kind: ReturnType<typeof pdfErrorKind>
      message: string
    }

function run(request: WorkerRequest): Promise<WorkerResult> {
  switch (request.op) {
    case 'merge':
      return mergePdfs(request.files)
    case 'organise':
      return organisePdf(request.file, request.plan)
    case 'split':
      return splitPdf(request.file, request.parts)
  }
}

/** The result's buffers, to hand over to the page rather than copy. */
function buffersOf(result: WorkerResult) {
  const arrays =
    result instanceof Uint8Array
      ? [result]
      : [...result.files, ...(result.zip ? [result.zip] : [])]
  // Each buffer can only be listed once.
  return [...new Set(arrays.map((bytes) => bytes.buffer))]
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    const result = await run(data)
    response = { id: data.id, ok: true, result }
    self.postMessage(response, { transfer: buffersOf(result) })
    return
  } catch (e) {
    response = {
      id: data.id,
      ok: false,
      kind: pdfErrorKind(e),
      message: String(e),
    }
  }
  self.postMessage(response)
}
