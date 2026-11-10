import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'compress-images',
  name: 'Compress images',
  description:
    'Make JPG, PNG, WebP and HEIC images smaller in file size, keeping how they look, right in your browser. Your files never leave your device.',
  category: 'Images',
  accepts: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'],
}
