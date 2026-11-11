import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'image-to-text',
  name: 'Image to text',
  short: 'Copy text from photos',
  description:
    'Copy the text out of photos and screenshots, right in your browser. Your files never leave your device.',
  category: 'Images',
  accepts: ['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'bmp'],
  keywords: [
    'ocr',
    'text',
    'extract text',
    'copy text',
    'screenshot',
    'photo',
    'picture',
    'text recognition',
    'recognise text',
    'recognize text',
    'read text',
  ],
}
