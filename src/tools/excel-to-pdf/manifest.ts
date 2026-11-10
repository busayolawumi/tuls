import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'excel-to-pdf',
  name: 'Excel to PDF',
  short: 'Spreadsheets and CSV',
  description:
    'Turn Excel spreadsheets and CSV files into PDFs, with LibreOffice running in your browser. Your files never leave your device.',
  category: 'Documents',
  accepts: ['xlsx', 'xlsm', 'xls', 'ods', 'csv', 'tsv'],
  keywords: ['convert', 'xlsx to pdf', 'csv to pdf', 'spreadsheet', 'sheet'],
  isolated: true,
}
