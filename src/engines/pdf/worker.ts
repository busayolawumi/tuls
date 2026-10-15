// Runs PDF work in a background thread, so the page stays responsive with
// big files. Started by client.ts.
import { pdfErrorKind } from './errors'
import { imagesToPdf, type PageImage, type PageSize } from './images'
import { mergePdfs } from './merge'
import { organisePdf, type PagePlan } from './organise'
import { splitPdf } from './split'

export type WorkerRequest =
  | { id: number; op: 'merge'; files: ArrayBuffer[] }
  | { id: number; op: 'organise'; file: ArrayBuffer; plan: PagePlan[] }
  | { id: number; op: 'split'; file: ArrayBuffer; groups: number[][] }
  | { id: number; op: 'images'; images: PageImage[]; size: PageSize }
export type WorkerResult = Uint8Array | Uint8Array[]
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
      return splitPdf(request.file, request.groups)
    case 'images':
      return imagesToPdf(request.images, request.size)
  }
}

/** The result's buffers, to hand over to the page rather than copy. */
function buffersOf(result: WorkerResult) {
  const arrays = Array.isArray(result) ? result : [result]
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
