// Runs PDF work in a background thread, so the page stays responsive with
// big files. Started by client.ts.
import qpdfWasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'
import { setQpdfWasm } from '../qpdf/qpdf'
import { cleanPdf } from './clean'
import { pdfErrorKind } from './errors'
import { imagesToPdf, type PageImage, type PageSize } from './images'
import { mergePdfs } from './merge'
import { organisePdf, type PagePlan } from './organise'
import { protectPdf, unlockPdf } from './passwords'
import { hasSignatures } from './signatures'
import { splitPdf } from './split'

// qpdf's engine is only fetched when a PDF with a password comes along.
setQpdfWasm(qpdfWasm)

export type WorkerRequest =
  | { id: number; op: 'merge'; files: ArrayBuffer[] }
  | { id: number; op: 'organise'; file: ArrayBuffer; plan: PagePlan[] }
  | { id: number; op: 'split'; file: ArrayBuffer; groups: number[][] }
  | { id: number; op: 'images'; images: PageImage[]; size: PageSize }
  | { id: number; op: 'clean'; file: ArrayBuffer }
  | { id: number; op: 'protect'; file: ArrayBuffer; password: string }
  | { id: number; op: 'unlock'; file: ArrayBuffer; password: string }
  | { id: number; op: 'signed'; file: ArrayBuffer }
export type WorkerResult = Uint8Array | Uint8Array[] | boolean
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
    case 'clean':
      return cleanPdf(request.file)
    case 'protect':
      return protectPdf(request.file, request.password)
    case 'unlock':
      return unlockPdf(request.file, request.password)
    case 'signed':
      return hasSignatures(request.file)
  }
}

/** The result's buffers, to hand over to the page rather than copy. */
function buffersOf(result: WorkerResult) {
  if (typeof result === 'boolean') return []
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
