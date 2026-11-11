import type { ToolCategory, ToolManifest } from './types.ts'
import { manifest as compressPdf } from './compress-pdf/manifest.ts'
import { manifest as compressImages } from './compress-images/manifest.ts'
import { manifest as convertImages } from './convert-images/manifest.ts'
import { manifest as excelToPdf } from './excel-to-pdf/manifest.ts'
import { manifest as imagesToPdf } from './images-to-pdf/manifest.ts'
import { manifest as mergePdf } from './merge-pdf/manifest.ts'
import { manifest as imageToText } from './image-to-text/manifest.ts'
import { manifest as ocrPdf } from './ocr-pdf/manifest.ts'
import { manifest as organisePdf } from './organise-pdf/manifest.ts'
import { manifest as pdfToExcel } from './pdf-to-excel/manifest.ts'
import { manifest as pdfToImages } from './pdf-to-images/manifest.ts'
import { manifest as pdfToWord } from './pdf-to-word/manifest.ts'
import { manifest as powerpointToPdf } from './powerpoint-to-pdf/manifest.ts'
import { manifest as protectPdf } from './protect-pdf/manifest.ts'
import { manifest as resizeImages } from './resize-images/manifest.ts'
import { manifest as splitPdf } from './split-pdf/manifest.ts'
import { manifest as unlockPdf } from './unlock-pdf/manifest.ts'
import { manifest as videoToGif } from './video-to-gif/manifest.ts'
import { manifest as wordToPdf } from './word-to-pdf/manifest.ts'

/** The home page's groups, in order. */
export const categories: ToolCategory[] = [
  'PDF',
  'Documents',
  'Images',
  'Video',
]

/**
 * Every tool, in the order the home page lists them within their group. To
 * add one, give it a folder with a manifest.ts and a Tool.tsx, and list its
 * manifest here.
 */
export const tools: ToolManifest[] = [
  mergePdf,
  organisePdf,
  splitPdf,
  imagesToPdf,
  pdfToImages,
  protectPdf,
  unlockPdf,
  compressPdf,
  ocrPdf,
  wordToPdf,
  excelToPdf,
  powerpointToPdf,
  pdfToWord,
  pdfToExcel,
  convertImages,
  resizeImages,
  compressImages,
  imageToText,
  videoToGif,
]
