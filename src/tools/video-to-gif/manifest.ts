import type { ToolManifest } from '../types.ts'

export const manifest: ToolManifest = {
  id: 'video-to-gif',
  name: 'Video to GIF',
  short: 'Turn a clip into a loop',
  description:
    'Pick the best part of any video and make it loop. Your video never leaves your device.',
  category: 'Video',
  single: true,
  accepts: ['mp4', 'm4v', 'mov', 'webm'],
  keywords: [
    'gif',
    'animated',
    'animation',
    'clip',
    'loop',
    'meme',
    'screen recording',
    'video',
  ],
}
