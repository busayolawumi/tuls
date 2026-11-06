import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'convert-images',
  name: 'Convert images',
  description:
    'Turn HEIC photos into JPG, or convert between JPG, PNG and WebP, right in your browser. Your files never leave your device.',
  category: 'Images',
  accepts: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'],
}
