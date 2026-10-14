import { Link } from 'react-router'
import { useTitle } from '../lib/useTitle.ts'

function NotFound() {
  useTitle('Page not found · Tuls')
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-20">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Page not found
      </h1>
      <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
        There’s nothing at this address. The link may be wrong, or the page may
        have moved.
      </p>
      <Link
        className="mt-6 font-medium text-link underline underline-offset-4 hover:no-underline"
        to="/"
      >
        Go to the home page
      </Link>
    </section>
  )
}

export default NotFound
