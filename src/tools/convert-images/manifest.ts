import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'convert-images',
  name: 'Convert images',
  short: 'HEIC to JPG, PNG or WebP',
  description:
    'Turn HEIC photos into JPG, or convert between JPG, PNG and WebP, right in your browser. Your files never leave your device.',
  category: 'Images',
  accepts: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'],
  keywords: [
    'convert',
    'change format',
    'heic to jpg',
    'png to jpg',
    'jpg to png',
    'webp to jpg',
    'iphone photos',
    'photo',
    'picture',
  ],
}
