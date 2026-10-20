import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'compress-pdf',
  name: 'Compress PDF',
  description:
    'Make PDFs smaller for email and uploads, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
}
