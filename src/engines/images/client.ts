import type { ResizeReply, ResizeRequest } from './worker'

let worker: Worker | undefined
let lastId = 0
const waiting = new Map<
  number,
  {
    resolve: (pixels: Uint8ClampedArray<ArrayBuffer>) => void
    reject: (error: Error) => void
  }
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
  worker.onmessage = ({ data }: MessageEvent<ResizeReply>) => {
    const job = waiting.get(data.id)
    if (!job) return
    waiting.delete(data.id)
    if ('error' in data) job.reject(new Error(data.error))
    else job.resolve(new Uint8ClampedArray(data.pixels))
  }
  worker.onerror = (event) => {
    event.preventDefault()
    failAll(new Error(event.message || 'The image engine stopped'))
  }
  return worker
}

/** Shrinks RGBA pixels with Lanczos. The buffer passed in is given up. */
export function resizePixels(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  toWidth: number,
  toHeight: number,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const id = ++lastId
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    const request: ResizeRequest = {
      id,
      pixels,
      width,
      height,
      toWidth,
      toHeight,
    }
    ;(worker ?? start()).postMessage(request, [pixels])
  })
}

/** Stops a job at once (Cancel), and frees the engine's memory. */
export function stopImages() {
  if (worker) failAll(new Error('Stopped'))
}
