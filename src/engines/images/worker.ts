import mozEncode from '@jsquash/jpeg/encode'
import oxiInit, {
  optimise,
  optimise_raw,
} from '@jsquash/oxipng/codec/pkg/squoosh_oxipng.js'
import oxiUrl from '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm?url'
import resizeInit, {
  resize,
} from '@jsquash/resize/lib/resize/pkg/squoosh_resize.js'
import resizeUrl from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?url'
import webpEncode from '@jsquash/webp/encode'
import quantInit, {
  encode_palette_to_png,
  ImageQuantizer,
} from 'libimagequant-wasm/wasm/libimagequant_wasm.js'
import quantUrl from 'libimagequant-wasm/wasm/libimagequant_wasm_bg.wasm?url'
import type { ImageFormat } from '../../lib/picture'
import { compressPixels, type Encoders, type Goal, type Pixels } from './fit'

export type ImageRequest =
  | {
      id: number
      op: 'resize'
      pixels: ArrayBuffer
      width: number
      height: number
      toWidth: number
      toHeight: number
    }
  | {
      id: number
      op: 'compress'
      pixels: ArrayBuffer
      width: number
      height: number
      format: ImageFormat
      goal: Goal
    }
export type ImageReply =
  | { id: number; bytes: ArrayBuffer; width: number; height: number }
  | { id: number; tooBig: true }
  | { id: number; error: string }

const LANCZOS = 3
const EXACT_LEVEL_PIXELS = 4_000_000

let resizeReady: ReturnType<typeof resizeInit> | undefined
let oxiReady: ReturnType<typeof oxiInit> | undefined
let quantReady: ReturnType<typeof quantInit> | undefined

async function lanczos(pixels: Pixels, width: number, height: number) {
  resizeReady ??= resizeInit(resizeUrl)
  await resizeReady
  const data = resize(
    new Uint8Array(pixels.data.buffer),
    pixels.width,
    pixels.height,
    width,
    height,
    LANCZOS,
    true,
    false,
  )
  return {
    data: new Uint8ClampedArray(data.buffer as ArrayBuffer),
    width,
    height,
  }
}

function encodersFor(format: ImageFormat): Encoders {
  return {
    lossy: async (pixels, quality) => {
      const image = new ImageData(pixels.data, pixels.width, pixels.height)
      const encode = format === 'webp' ? webpEncode : mozEncode
      return new Uint8Array(await encode(image, { quality }))
    },
    exact: async (pixels) => {
      oxiReady ??= oxiInit(oxiUrl)
      await oxiReady
      const level = pixels.width * pixels.height <= EXACT_LEVEL_PIXELS ? 2 : 1
      return optimise_raw(
        pixels.data,
        pixels.width,
        pixels.height,
        level,
        false,
        true,
      )
    },
    colours: async (pixels, min, target) => {
      quantReady ??= quantInit({ module_or_path: quantUrl })
      oxiReady ??= oxiInit(oxiUrl)
      await Promise.all([quantReady, oxiReady])
      const quantizer = new ImageQuantizer()
      let result
      try {
        quantizer.setQuality(min, target)
        quantizer.setSpeed(4)
        result = quantizer.quantizeImage(
          pixels.data,
          pixels.width,
          pixels.height,
        )
      } catch {
        quantizer.free()
        return undefined
      }
      try {
        result.setDithering(1)
        const indices = result.getPaletteIndices(
          pixels.data,
          pixels.width,
          pixels.height,
        )
        const palette = encode_palette_to_png(
          indices,
          result.getPalette(),
          pixels.width,
          pixels.height,
        )
        return optimise(palette, 2, false, true)
      } finally {
        result.free()
        quantizer.free()
      }
    },
    resize: lanczos,
  }
}

self.onmessage = async ({ data }: MessageEvent<ImageRequest>) => {
  try {
    const pixels: Pixels = {
      data: new Uint8ClampedArray(data.pixels),
      width: data.width,
      height: data.height,
    }
    const made =
      data.op === 'resize'
        ? await lanczos(pixels, data.toWidth, data.toHeight).then((out) => ({
            bytes: out.data,
            width: out.width,
            height: out.height,
          }))
        : await compressPixels(
            pixels,
            data.format,
            data.goal,
            encodersFor(data.format),
          )
    if (!made) {
      self.postMessage({ id: data.id, tooBig: true } satisfies ImageReply)
      return
    }
    const bytes =
      made.bytes.byteOffset === 0 &&
      made.bytes.byteLength === made.bytes.buffer.byteLength
        ? (made.bytes.buffer as ArrayBuffer)
        : (made.bytes.slice().buffer as ArrayBuffer)
    const reply: ImageReply = {
      id: data.id,
      bytes,
      width: made.width,
      height: made.height,
    }
    self.postMessage(reply, { transfer: [bytes] })
  } catch (e) {
    resizeReady = oxiReady = quantReady = undefined
    self.postMessage({ id: data.id, error: String(e) } satisfies ImageReply)
  }
}
