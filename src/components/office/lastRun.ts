import { lastRun } from '../../lib/lastRun'

// The Office tools' note about a page that closed mid-conversion
// (lib/lastRun.ts).
export const { markConverting, markDone, closedWhileConverting } = lastRun(
  'tuls:office:converting',
)
