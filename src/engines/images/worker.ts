import init, { resize } from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js'
import wasmUrl from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url'

export type ResizeRequest = {
  id: number
  pixels: ArrayBuffer
  width: number
  height: number
  toWidth: number
  toHeight: number
}
export type ResizeReply =
  { id: number; pixels: ArrayBuffer } | { id: number; error: string }

const LANCZOS = 3

let ready: ReturnType<typeof init> | undefined

self.onmessage = async ({ data }: MessageEvent<ResizeRequest>) => {
  try {
    ready ??= init(wasmUrl)
    await ready
    const result = resize(
      new Uint8Array(data.pixels),
      data.width,
      data.height,
      data.toWidth,
      data.toHeight,
      LANCZOS,
      true,
      false,
    )
    const pixels = result.buffer as ArrayBuffer
    const reply: ResizeReply = { id: data.id, pixels }
    self.postMessage(reply, { transfer: [pixels] })
  } catch (e) {
    ready = undefined
    const reply: ResizeReply = { id: data.id, error: String(e) }
    self.postMessage(reply)
  }
}
