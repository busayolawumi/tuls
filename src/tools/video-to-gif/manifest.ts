import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'video-to-gif',
  name: 'Video to GIF',
  description:
    'Pick the best part of any video and make it loop. Your video never leaves your device.',
  category: 'Video',
  accepts: ['mp4', 'm4v', 'mov', 'webm'],
}
