import { runQpdf } from '../qpdf/qpdf'
import { madeFile } from './passwords'

// OCR PDF's last step: each page's recognised text, an invisible one-page
// PDF the size of the page as shown, is laid over that page with qpdf. qpdf
// fits it to the page's rotation and crop. Pages that were sideways are
// turned first, in a run of their own: in one run, qpdf places the text
// before turning the page.

export type TextLayer = {
  /** The page, numbered from 1. */
  page: number
  /** Quarter turns clockwise that make the page upright, 0–3. */
  turn: number
  layer: ArrayBuffer
}

export async function addTextLayers(file: ArrayBuffer, layers: TextLayer[]) {
  let pdf = new Uint8Array(file)
  const turns = new Map<number, number[]>()
  for (const { page, turn } of layers) {
    if (turn % 4) turns.set(turn % 4, [...(turns.get(turn % 4) ?? []), page])
  }
  if (turns.size > 0) {
    const rotate = [...turns].map(
      ([turn, pages]) => `--rotate=+${turn * 90}:${pages.join(',')}`,
    )
    const turned = await runQpdf(
      ['/in.pdf', '--decrypt', ...rotate, '/turned.pdf'],
      { 'in.pdf': pdf },
      ['turned.pdf'],
    )
    pdf = madeFile(turned, 'turned.pdf') as Uint8Array<ArrayBuffer>
  }
  const inputs: Record<string, Uint8Array> = { 'in.pdf': pdf }
  const overlays: string[] = []
  for (const [i, { page, layer }] of layers.entries()) {
    inputs[`layer${i}.pdf`] = new Uint8Array(layer)
    overlays.push('--overlay', `/layer${i}.pdf`, `--to=${page}`, '--')
  }
  const result = await runQpdf(
    [
      '/in.pdf',
      '--decrypt',
      '--remove-info',
      '--remove-metadata',
      ...overlays,
      '/out.pdf',
    ],
    inputs,
    ['out.pdf'],
  )
  return madeFile(result, 'out.pdf')
}
