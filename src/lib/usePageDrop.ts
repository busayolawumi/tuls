import { useEffect, useRef, useState } from 'react'

/**
 * Lets files be dropped anywhere on the page, so a near miss doesn't make
 * the browser leave Tuls to open the file itself. Returns whether files are
 * being dragged over the page.
 */
export function usePageDrop(onDrop: (files: FileList) => void) {
  const [dragging, setDragging] = useState(false)
  const latest = useRef(onDrop)
  useEffect(() => {
    latest.current = onDrop
  })

  useEffect(() => {
    // dragenter and dragleave fire for every element the file passes over,
    // so count them to know when it has left the page.
    let depth = 0
    const hasFiles = (e: DragEvent) =>
      e.dataTransfer?.types.includes('Files') ?? false

    function handleEnter(e: DragEvent) {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    function handleLeave(e: DragEvent) {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    function handleOver(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    function handleDrop(e: DragEvent) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      if (e.dataTransfer) latest.current(e.dataTransfer.files)
    }

    window.addEventListener('dragenter', handleEnter)
    window.addEventListener('dragleave', handleLeave)
    window.addEventListener('dragover', handleOver)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleEnter)
      window.removeEventListener('dragleave', handleLeave)
      window.removeEventListener('dragover', handleOver)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  return dragging
}
