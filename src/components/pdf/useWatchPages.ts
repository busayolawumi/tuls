import { useCallback, useEffect, useRef } from 'react'

/**
 * Tells `want` when a page's thumbnail comes near the screen, and `unwant`
 * when it leaves, so only those pages get drawn. Give each thumbnail's
 * element the returned `watch` as its ref, and its page number (from 0) as
 * `data-index`.
 */
export function useWatchPages(
  want: (index: number) => void,
  unwant: (index: number) => void,
) {
  // One watcher for every thumbnail. Thumbnails sign up as they appear; the
  // watcher is remade when want/unwant change (another PDF), and picks up
  // every signed-up thumbnail again.
  const watched = useRef(new Set<HTMLElement>())
  const watcher = useRef<IntersectionObserver>(undefined)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index)
          if (entry.isIntersecting) want(index)
          else unwant(index)
        }
      },
      // Start drawing a little before a page scrolls into view.
      { rootMargin: '400px 0px' },
    )
    for (const element of watched.current) observer.observe(element)
    watcher.current = observer
    return () => {
      observer.disconnect()
      watcher.current = undefined
    }
  }, [want, unwant])

  return useCallback((element: HTMLElement | null) => {
    if (!element) return
    watched.current.add(element)
    watcher.current?.observe(element)
    return () => {
      watched.current.delete(element)
      watcher.current?.unobserve(element)
    }
  }, [])
}
