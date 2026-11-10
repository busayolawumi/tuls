import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'merge-pdf',
  name: 'Merge PDFs',
  short: 'Combine PDFs into one',
  description:
    'Combine several PDFs into one, in the order you choose. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
  keywords: ['merge', 'combine', 'join', 'append', 'put together'],
}
