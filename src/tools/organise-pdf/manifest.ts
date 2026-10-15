import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'organise-pdf',
  name: 'Organise PDF',
  description:
    'Reorder, rotate and delete the pages of a PDF. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
}
