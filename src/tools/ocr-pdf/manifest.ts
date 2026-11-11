import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'ocr-pdf',
  name: 'OCR PDF',
  short: 'Make scanned PDFs searchable',
  description:
    'Make scanned PDFs searchable by reading the text in their pages, right in your browser. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
  keywords: [
    'ocr',
    'searchable',
    'scan',
    'scanned',
    'text recognition',
    'recognise text',
    'recognize text',
    'copy text',
    'select text',
  ],
}
