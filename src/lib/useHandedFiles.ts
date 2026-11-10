import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { forgetHandedFiles, handedFiles } from './handover'

/** Gives a tool's file picker the files chosen for it on the home page. */
export function useHandedFiles(take: (files: File[]) => void) {
  const { pathname } = useLocation()
  const latest = useRef(take)
  useEffect(() => {
    latest.current = take
  })

  useEffect(() => {
    let live = true
    void handedFiles(pathname.slice(1)).then((files) => {
      if (!live || !files) return
      forgetHandedFiles()
      latest.current(files)
    })
    return () => {
      live = false
    }
  }, [pathname])
}
