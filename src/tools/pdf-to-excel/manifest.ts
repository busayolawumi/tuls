import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'pdf-to-excel',
  name: 'PDF to Excel',
  short: 'Tables into spreadsheets',
  description:
    'Turn the tables in PDFs into Excel spreadsheets, right in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['pdf'],
  keywords: [
    'convert',
    'pdf to xlsx',
    'spreadsheet',
    'tables',
    'bank statement',
  ],
}
