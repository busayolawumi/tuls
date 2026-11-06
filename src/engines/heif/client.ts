import type { HeifReply, HeifRequest } from './worker'

export type Decoded = {
  width: number
  height: number
  /** RGBA, four bytes a pixel, in the image's own colours. */
  pixels: Uint8ClampedArray<ArrayBuffer>
}

let worker: Worker | undefined
let lastId = 0
const waiting = new Map<
  number,
  { resolve: (decoded: Decoded) => void; reject: (error: Error) => void }
>()

function failAll(error: Error) {
  for (const job of waiting.values()) job.reject(error)
  waiting.clear()
  worker?.terminate()
  worker = undefined
}

function start() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = ({ data }: MessageEvent<HeifReply>) => {
    const job = waiting.get(data.id)
    if (!job) return
    waiting.delete(data.id)
    if ('error' in data) job.reject(new Error(data.error))
    else {
      job.resolve({
        width: data.width,
        height: data.height,
        pixels: new Uint8ClampedArray(data.pixels),
      })
    }
  }
  worker.onerror = (event) => {
    event.preventDefault()
    failAll(new Error(event.message || 'The HEIC decoder stopped'))
  }
  return worker
}

/** Decodes a HEIC or HEIF photo with libheif, upright as it's meant to be. */
export function decodeHeif(bytes: ArrayBuffer): Promise<Decoded> {
  const id = ++lastId
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    const request: HeifRequest = { id, bytes }
    ;(worker ?? start()).postMessage(request, [bytes])
  })
}

/** Stops a decode at once (Cancel), and frees the decoder's memory. */
export function stopHeif() {
  if (worker) failAll(new Error('Stopped'))
}
