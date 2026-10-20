import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'excel-to-pdf',
  name: 'Excel to PDF',
  description:
    'Turn Excel spreadsheets and CSV files into PDFs, with LibreOffice running in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv'],
  isolated: true,
}
