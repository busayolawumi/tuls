import { useEffect } from 'react'

/**
 * While `active`, a file dropped on the page is ignored. Without a drop zone
 * on screen, the browser would open the file itself, leaving the tool and
 * losing the work in it.
 */
export function useIgnoreFileDrops(active: boolean) {
  useEffect(() => {
    if (!active) return
    const ignore = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', ignore)
    window.addEventListener('drop', ignore)
    return () => {
      window.removeEventListener('dragover', ignore)
      window.removeEventListener('drop', ignore)
    }
  }, [active])
}
