import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'pdf-to-word',
  name: 'PDF to Word',
  description:
    'Turn PDFs into Word documents you can edit, right in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['pdf'],
}
