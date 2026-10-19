import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'protect-pdf',
  name: 'Protect PDF',
  description:
    'Add a password to PDFs, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
}
