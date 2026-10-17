import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'powerpoint-to-pdf',
  name: 'PowerPoint to PDF',
  description:
    'Turn PowerPoint presentations into PDFs, with LibreOffice running in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['pptx', 'ppsx', 'ppt', 'odp'],
  isolated: true,
}
