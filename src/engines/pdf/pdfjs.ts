import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { imageScale } from './scale'

// pdf.js (Mozilla's PDF reader) for looking at PDFs: page counts and page
// pictures. It's only downloaded when a PDF tool first needs it, and does
// its parsing in its own worker.

let pdfjs: Promise<typeof import('pdfjs-dist')> | undefined

function load() {
  pdfjs ??= import('pdfjs-dist').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = workerUrl
    return lib
  })
  return pdfjs
}

/** Opens a PDF for reading. Close it with `closePdf()` when done. */
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await load()
  return lib.getDocument({
    // pdf.js takes over the buffer, so give it a copy.
    data: new Uint8Array(data.slice(0)),
    standardFontDataUrl: `${__PDFJS_ASSETS__}standard_fonts/`,
    cMapUrl: `${__PDFJS_ASSETS__}cmaps/`,
    wasmUrl: `${__PDFJS_ASSETS__}wasm/`,
    iccUrl: `${__PDFJS_ASSETS__}iccs/`,
    // Only errors in the console, not pdf.js's notes about odd PDFs.
    verbosity: 0,
  }).promise
}

/** Frees what pdf.js holds for a PDF, including its share of the worker. */
export function closePdf(doc: PDFDocumentProxy) {
  return doc.loadingTask.destroy()
}

/**
 * Draws one page (numbered from 1) as a small JPEG, `height` pixels tall,
 * for thumbnails. With `width` too, it fits inside that box instead, so wide
 * pages aren't drawn bigger than needed. Returns a data URL.
 */
export async function pagePicture(
  doc: PDFDocumentProxy,
  pageNumber: number,
  height: number,
  width = Infinity,
): Promise<string> {
  const page = await doc.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(height / base.height, width / base.width)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    page.cleanup()
  }
}

/** A page drawn as an image file, and its size in pixels. */
export type PageImageFile = { blob: Blob; width: number; height: number }

/**
 * Draws one page (numbered from 1) as a JPEG or PNG at `dpi` dots per inch,
 * on white, as it would print. Big pages are drawn smaller (see scale.ts).
 */
export async function pageImageFile(
  doc: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  type: 'image/jpeg' | 'image/png',
): Promise<PageImageFile> {
  const page = await doc.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({
      scale: imageScale(base.width, base.height, dpi),
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: 'white' }).promise
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.92),
    )
    const { width, height } = canvas
    // Let the canvas's memory go now; Safari is slow to on its own.
    canvas.width = canvas.height = 0
    if (!blob) throw new Error('Couldn’t make an image of the page')
    return { blob, width, height }
  } finally {
    page.cleanup()
  }
}
