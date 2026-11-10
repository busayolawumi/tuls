import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'pdf-to-word',
  name: 'PDF to Word',
  short: 'Editable Word documents',
  description:
    'Turn PDFs into Word documents you can edit, right in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['pdf'],
  keywords: ['convert', 'pdf to docx', 'edit pdf', 'editable'],
}
