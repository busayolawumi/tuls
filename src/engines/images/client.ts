import type { ImageFormat } from '../../lib/picture'
import type { Goal } from './fit'
import type { ImageReply, ImageRequest } from './worker'

type Made = { bytes: ArrayBuffer; width: number; height: number }
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never

let worker: Worker | undefined
let lastId = 0
const waiting = new Map<
  number,
  { resolve: (made: Made | undefined) => void; reject: (error: Error) => void }
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
  worker.onmessage = ({ data }: MessageEvent<ImageReply>) => {
    const job = waiting.get(data.id)
    if (!job) return
    waiting.delete(data.id)
    if ('error' in data) job.reject(new Error(data.error))
    else if ('tooBig' in data) job.resolve(undefined)
    else job.resolve(data)
  }
  worker.onerror = (event) => {
    event.preventDefault()
    failAll(new Error(event.message || 'The image engine stopped'))
  }
  return worker
}

function send(request: DistributiveOmit<ImageRequest, 'id'>) {
  const id = ++lastId
  return new Promise<Made | undefined>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    ;(worker ?? start()).postMessage({ ...request, id } as ImageRequest, [
      request.pixels,
    ])
  })
}

/** Shrinks RGBA pixels with Lanczos. The buffer passed in is given up. */
export async function resizePixels(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  toWidth: number,
  toHeight: number,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const made = await send({
    op: 'resize',
    pixels,
    width,
    height,
    toWidth,
    toHeight,
  })
  if (!made) throw new Error('Couldn’t resize the image')
  return new Uint8ClampedArray(made.bytes)
}

/**
 * A smaller file of RGBA pixels, or undefined if it can't get under the
 * size asked for. The buffer passed in is given up.
 */
export function compressPixels(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  format: ImageFormat,
  goal: Goal,
) {
  return send({ op: 'compress', pixels, width, height, format, goal })
}

/** Stops a job at once (Cancel), and frees the engine's memory. */
export function stopImages() {
  if (worker) failAll(new Error('Stopped'))
}
