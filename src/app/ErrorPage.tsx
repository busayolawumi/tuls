import { useEffect } from 'react'
import { useRouteError } from 'react-router'
import { useTitle } from '../lib/useTitle.ts'

// Shown when a page crashes or can't load. The usual cause is Tuls being
// updated while it's open: the old page asks for files that no longer exist,
// and reloading fixes it.
function ErrorPage() {
  const error = useRouteError()
  useTitle('Something went wrong · Tuls')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
        This page couldn’t load. Reloading usually fixes it, especially if Tuls
        has just been updated.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Reload the page
      </button>
    </section>
  )
}

export default ErrorPage
