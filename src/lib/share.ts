// Sharing files through the device's share sheet. Only some browsers can
// (mostly on phones); where they can't, tools don't offer it.

/** Whether files of this type can be shared here. */
export function canShareFiles(type: string) {
  const probe = new File([''], 'file', { type })
  return navigator.canShare?.({ files: [probe] }) ?? false
}

/** Opens the share sheet. Closing it without sharing isn't an error. */
export async function shareFiles(files: File[]) {
  try {
    await navigator.share({ files })
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      console.error(e)
    }
  }
}
