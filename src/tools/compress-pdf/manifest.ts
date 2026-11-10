import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'compress-pdf',
  name: 'Compress PDF',
  short: 'Smaller PDFs for email',
  description:
    'Make PDFs smaller for email and uploads, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
  keywords: [
    'compress',
    'shrink',
    'reduce',
    'smaller',
    'optimise',
    'optimize',
    'file size',
    'email',
  ],
}
