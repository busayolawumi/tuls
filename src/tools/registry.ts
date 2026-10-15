import type { ToolManifest } from './types.ts'
import { manifest as imagesToPdf } from './images-to-pdf/manifest.ts'
import { manifest as mergePdf } from './merge-pdf/manifest.ts'
import { manifest as organisePdf } from './organise-pdf/manifest.ts'
import { manifest as splitPdf } from './split-pdf/manifest.ts'
import { manifest as videoToGif } from './video-to-gif/manifest.ts'

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
]
