import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'unlock-pdf',
  name: 'Unlock PDF',
  description:
    'Take the password off PDFs, or change it, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
}
