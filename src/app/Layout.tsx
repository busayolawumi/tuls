import { useEffect, useRef } from 'react'
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { SOURCE_URL } from '../site.ts'

// The frame around every page: wordmark, the page itself, and the footer.
function Layout() {
  const main = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const shown = useRef(pathname)

  // After moving to another page, focus the new page's content, so screen
  // readers announce it and keyboard users start from the top. Not on the
  // first load, where the browser already does the right thing.
  useEffect(() => {
    if (shown.current === pathname) return
    shown.current = pathname
    main.current?.focus()
  }, [pathname])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <Link className="text-xl font-semibold tracking-tight" to="/">
          Tuls<span className="text-accent">.</span>
        </Link>
      </header>
      <main
        ref={main}
        tabIndex={-1}
        className="flex flex-1 flex-col outline-none"
      >
        <Outlet />
      </main>
      <Footer />
      <ScrollRestoration />
    </div>
  )
}

function Footer() {
  const link =
    'underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100'
  // Tuls is AGPL and sends FFmpeg (GPL) to every visitor, so both licences
  // and their source must be easy to find. /licences.txt has the notices and
  // the full GPL text; GitHub has Tuls's own source.
  return (
    <footer className="pt-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
      <a className={link} href={SOURCE_URL}>
        GitHub
      </a>
      {' · '}
      <Link className={link} to="/privacy">
        Privacy
      </Link>
      {' · '}
      <a className={link} href="/licences.txt">
        Licences
      </a>
    </footer>
  )
}

export default Layout
