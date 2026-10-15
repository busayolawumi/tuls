// Runs PDF work in a background thread, so the page stays responsive with
// big files. Started by client.ts.
import { pdfErrorKind } from './errors'
import { mergePdfs } from './merge'
import { organisePdf, type PagePlan } from './organise'

export type WorkerRequest =
  | { id: number; op: 'merge'; files: ArrayBuffer[] }
  | { id: number; op: 'organise'; file: ArrayBuffer; plan: PagePlan[] }
export type WorkerResponse =
  | { id: number; ok: true; result: Uint8Array }
  | {
      id: number
      ok: false
      kind: ReturnType<typeof pdfErrorKind>
      message: string
    }

function run(request: WorkerRequest) {
  switch (request.op) {
    case 'merge':
      return mergePdfs(request.files)
    case 'organise':
      return organisePdf(request.file, request.plan)
  }
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    const result = await run(data)
    response = { id: data.id, ok: true, result }
    self.postMessage(response, { transfer: [result.buffer] })
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
