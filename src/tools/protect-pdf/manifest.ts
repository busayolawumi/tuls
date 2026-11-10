import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'protect-pdf',
  name: 'Protect PDF',
  short: 'Add a password',
  description:
    'Add a password to PDFs, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
  keywords: ['password', 'encrypt', 'lock', 'secure'],
}
