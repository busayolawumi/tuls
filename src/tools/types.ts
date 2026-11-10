export type ToolCategory = 'Video' | 'Images' | 'PDF' | 'Documents'

/**
 * What the rest of Tuls needs to know about a tool: the home page lists it,
 * the router gives it a page, and the build writes that page's HTML (title,
 * description and link preview). Keep manifests as plain data, with no
 * imports from the tool's code, so the build can read them too.
 */
export type ToolManifest = {
  /** Also the page's address, e.g. "video-to-gif" for /video-to-gif. */
  id: string
  /** What it does, in a few words, e.g. "Video to GIF". */
  name: string
  /** One sentence for the home page, search results and link previews. */
  description: string
  category: ToolCategory
  /** File extensions it opens, without dots. Empty if it doesn't take files. */
  accepts: string[]
  /**
   * Other words people search for it by, lowercase: what it does in their
   * words ("combine"), and the conversions they'd type ("jpg to pdf").
   */
  keywords: string[]
  /**
   * The page must be cross-origin isolated, for engines that need
   * SharedArrayBuffer (LibreOffice). vercel.json must give its address the
   * COOP and COEP headers (a registry test checks), and links to it load the
   * page afresh from a page that isn't isolated (ToolLink), because headers
   * only count when a page loads.
   */
  isolated?: true
}
