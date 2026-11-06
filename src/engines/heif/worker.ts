import createLibheif from 'libheif-js/libheif-wasm/libheif.js'
import wasmUrl from 'libheif-js/libheif-wasm/libheif.wasm?url'

export type HeifRequest = { id: number; bytes: ArrayBuffer }
export type HeifReply =
  | { id: number; width: number; height: number; pixels: ArrayBuffer }
  | { id: number; error: string }

type HeifImage = {
  get_width(): number
  get_height(): number
  is_primary(): boolean
  display(
    target: { data: Uint8ClampedArray; width: number; height: number },
    done: (result: unknown) => void,
  ): void
  free(): void
}
type Libheif = {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] }
}

let ready: Promise<Libheif> | undefined

function libheif() {
  ready ??= fetch(wasmUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`HEIC decoder: ${response.status}`)
      return response.arrayBuffer()
    })
    .then(
      (wasmBinary) =>
        (createLibheif as unknown as (options: object) => Promise<Libheif>)({
          wasmBinary,
        }) as Promise<Libheif>,
    )
  ready.catch(() => (ready = undefined))
  return ready
}

self.onmessage = async ({ data }: MessageEvent<HeifRequest>) => {
  try {
    const lib = await libheif()
    const images = new lib.HeifDecoder().decode(new Uint8Array(data.bytes))
    const image = images.find((each) => each.is_primary()) ?? images[0]
    if (!image) throw new Error('No image in the HEIC file')
    const width = image.get_width()
    const height = image.get_height()
    const pixels = new Uint8ClampedArray(width * height * 4)
    const result = await new Promise((done) =>
      image.display({ data: pixels, width, height }, done),
    )
    for (const each of images) each.free()
    if (!result) throw new Error('The HEIC image couldn’t be decoded')
    const reply: HeifReply = {
      id: data.id,
      width,
      height,
      pixels: pixels.buffer,
    }
    self.postMessage(reply, { transfer: [pixels.buffer] })
  } catch (e) {
    const reply: HeifReply = { id: data.id, error: String(e) }
    self.postMessage(reply)
  }
}
