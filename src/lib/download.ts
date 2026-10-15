/**
 * Saves a file made on the spot, as clicking a download link would. For
 * files made only when asked for, like a ZIP of other files.
 */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  // Some browsers only follow links that are on the page.
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the file after the click, so let it go later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
