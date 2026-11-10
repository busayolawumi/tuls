import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'word-to-pdf',
  name: 'Word to PDF',
  description:
    'Turn Word documents into PDFs, with LibreOffice running in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['docx', 'doc', 'odt', 'rtf'],
  keywords: ['convert', 'docx to pdf', 'doc to pdf'],
  isolated: true,
}
