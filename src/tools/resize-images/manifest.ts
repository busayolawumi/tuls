import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'resize-images',
  name: 'Resize images',
  description:
    'Make images smaller in width and height, by a percentage or to a size you choose, right in your browser. Your files never leave your device.',
  category: 'Images',
  accepts: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'],
}
