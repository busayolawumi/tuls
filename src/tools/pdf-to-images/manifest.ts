import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'pdf-to-images',
  name: 'PDF to images',
  description:
    'Turn the pages of a PDF into JPG or PNG images. Your files never leave your device.',
  category: 'PDF',
  accepts: ['pdf'],
}
