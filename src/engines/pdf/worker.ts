// Runs PDF work in a background thread, so the page stays responsive with
// big files. Started by client.ts.
import { pdfErrorKind } from './errors'
import { mergePdfs } from './merge'

export type WorkerRequest = { id: number; op: 'merge'; files: ArrayBuffer[] }
export type WorkerResponse =
  | { id: number; ok: true; result: Uint8Array }
  | {
      id: number
      ok: false
      kind: ReturnType<typeof pdfErrorKind>
      message: string
    }

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    const result = await mergePdfs(data.files)
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
