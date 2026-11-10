import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'split-pdf',
  name: 'Split PDF',
  short: 'Break a PDF into parts',
  description:
    'Split a PDF into several smaller ones, at the pages you choose. Your files never leave your device.',
  category: 'PDF',
  single: true,
  accepts: ['pdf'],
  keywords: ['split', 'separate', 'extract pages', 'divide', 'cut'],
}
