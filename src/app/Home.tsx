import { Link } from 'react-router'
import { useTitle } from '../lib/useTitle.ts'
import { HEADLINE, SITE_NAME, TAGLINE } from '../site.ts'
import { tools } from '../tools/registry.ts'

function Home() {
  useTitle(SITE_NAME)
  return (
    <>
      <section className="flex flex-col items-center py-12 text-center sm:py-20">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          {HEADLINE}
        </h1>
        <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
          {TAGLINE}
        </p>
      </section>
      <section aria-labelledby="tools" className="pb-8">
        <h2
          id="tools"
          className="text-sm font-medium text-zinc-500 dark:text-zinc-400"
        >
          Tools
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.id}>
              <Link
                to={`/${tool.id}`}
                className="block h-full rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
              >
                <span className="font-medium">{tool.name}</span>
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
                  {tool.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

export default Home
