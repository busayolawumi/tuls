import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../components/Icon.tsx'
import { ICONS } from '../components/iconPaths.ts'
import { ToolLink } from '../components/ToolLink.tsx'
import { useTitle } from '../lib/useTitle.ts'
import { HEADLINE, SITE_NAME, TAGLINE } from '../site.ts'
import { categories, tools } from '../tools/registry.ts'
import type { ToolManifest } from '../tools/types.ts'
import { searchTools } from './search.ts'

const HEADING = 'text-sm font-medium text-zinc-500 dark:text-zinc-400'

function ToolList({ list }: { list: ToolManifest[] }) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {list.map((tool) => (
        <li key={tool.id}>
          <ToolLink
            tool={tool}
            className="block h-full rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <span className="font-medium">{tool.name}</span>
            <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
              {tool.description}
            </span>
          </ToolLink>
        </li>
      ))}
    </ul>
  )
}

const countOf = (n: number) => (n === 1 ? '1 tool' : `${n} tools`)

function Home() {
  useTitle(SITE_NAME)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const typed = query.trim()
  const found = typed ? searchTools(tools, typed) : tools

  const open = (event: FormEvent) => {
    event.preventDefault()
    const [first] = found
    if (!typed || !first) return
    if (first.isolated && !self.crossOriginIsolated) {
      location.assign(`/${first.id}`)
    } else {
      void navigate(`/${first.id}`)
    }
  }

  return (
    <>
      <section className="flex flex-col items-center pt-12 pb-10 text-center sm:pt-20 sm:pb-14">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {HEADLINE}
        </h1>
        <p className="mt-4 max-w-md text-balance text-zinc-600 dark:text-zinc-400">
          {TAGLINE}
        </p>
      </section>

      <form role="search" onSubmit={open} className="relative">
        <label htmlFor="tool-search" className="sr-only">
          Search tools
        </label>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 fill-none stroke-zinc-400 stroke-2 [stroke-linecap:round] dark:stroke-zinc-500"
        >
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4" />
        </svg>
        <input
          ref={input}
          id="tool-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('')
          }}
          placeholder="Search: merge, HEIC, password…"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          className="w-full rounded-lg border border-zinc-300 bg-transparent py-3 pr-12 pl-10 text-base placeholder:text-zinc-500 dark:border-zinc-700 dark:placeholder:text-zinc-400 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              input.current?.focus()
            }}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Icon d={ICONS.remove} />
          </button>
        )}
      </form>
      <p role="status" className="sr-only">
        {typed ? (found.length ? countOf(found.length) : 'No tools found') : ''}
      </p>

      {typed ? (
        <section aria-labelledby="results" className="mt-8 pb-8">
          <h2 id="results" className={HEADING}>
            {found.length ? countOf(found.length) : 'No tools found'}
          </h2>
          {found.length ? (
            <ToolList list={found} />
          ) : (
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">
              Nothing matches “{typed}”. Try a file type, like PDF or HEIC, or
              what you want to do, like merge or compress.
            </p>
          )}
        </section>
      ) : (
        <div className="pb-8">
          {categories.map((category) => (
            <section
              key={category}
              aria-labelledby={`tools-${category}`}
              className="mt-8"
            >
              <h2 id={`tools-${category}`} className={HEADING}>
                {category}
              </h2>
              <ToolList
                list={tools.filter((tool) => tool.category === category)}
              />
            </section>
          ))}
        </div>
      )}
    </>
  )
}

export default Home
