import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'pdf-to-images',
  name: 'PDF to images',
  short: 'Pages as JPG or PNG',
  description:
    'Turn the pages of a PDF into JPG or PNG images. Your files never leave your device.',
  category: 'PDF',
  single: true,
  accepts: ['pdf'],
  keywords: ['pdf to jpg', 'pdf to png', 'picture', 'photo', 'extract'],
}
