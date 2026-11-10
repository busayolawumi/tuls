import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'images-to-pdf',
  name: 'Images to PDF',
  description:
    'Turn photos, scans and screenshots into one PDF, in the order you choose. Your files never leave your device.',
  category: 'PDF',
  accepts: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'],
  keywords: [
    'jpg to pdf',
    'png to pdf',
    'heic to pdf',
    'photo',
    'picture',
    'scan',
    'screenshot',
  ],
}
