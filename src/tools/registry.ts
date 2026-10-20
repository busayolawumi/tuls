import type { ToolManifest } from './types.ts'
import { manifest as compressPdf } from './compress-pdf/manifest.ts'
import { manifest as excelToPdf } from './excel-to-pdf/manifest.ts'
import { manifest as imagesToPdf } from './images-to-pdf/manifest.ts'
import { manifest as mergePdf } from './merge-pdf/manifest.ts'
import { manifest as organisePdf } from './organise-pdf/manifest.ts'
import { manifest as pdfToExcel } from './pdf-to-excel/manifest.ts'
import { manifest as pdfToImages } from './pdf-to-images/manifest.ts'
import { manifest as pdfToWord } from './pdf-to-word/manifest.ts'
import { manifest as powerpointToPdf } from './powerpoint-to-pdf/manifest.ts'
import { manifest as protectPdf } from './protect-pdf/manifest.ts'
import { manifest as splitPdf } from './split-pdf/manifest.ts'
import { manifest as unlockPdf } from './unlock-pdf/manifest.ts'
import { manifest as videoToGif } from './video-to-gif/manifest.ts'
import { manifest as wordToPdf } from './word-to-pdf/manifest.ts'

/**
 * Every tool, in the order the home page lists them. To add one, give it a
 * folder with a manifest.ts and a Tool.tsx, and list its manifest here.
 */
export const tools: ToolManifest[] = [
  videoToGif,
  mergePdf,
  organisePdf,
  splitPdf,
  imagesToPdf,
  pdfToImages,
  protectPdf,
  unlockPdf,
  compressPdf,
  wordToPdf,
  pdfToWord,
  pdfToExcel,
  excelToPdf,
  powerpointToPdf,
]
