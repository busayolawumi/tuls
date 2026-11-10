import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../components/Icon.tsx'
import { ICONS } from '../components/iconPaths.ts'
import { ToolLink } from '../components/ToolLink.tsx'
import { handOver, handOverAcrossLoad } from '../lib/handover.ts'
import { usePageDrop } from '../lib/usePageDrop.ts'
import { useTitle } from '../lib/useTitle.ts'
import { HEADLINE, SITE_NAME, TAGLINE } from '../site.ts'
import { categories, tools } from '../tools/registry.ts'
import type { ToolManifest } from '../tools/types.ts'
import {
  acceptAll,
  FIT_MESSAGES,
  fileNames,
  filesTitle,
  toolsFor,
  unknownMessage,
} from './dropped.ts'
import { searchTools } from './search.ts'

const HEADING = 'text-sm font-medium text-zinc-500 dark:text-zinc-400'
const TEXT_BUTTON = 'text-sm text-link underline-offset-2 hover:underline'
const ACCEPT = acceptAll(tools)

function ToolList({
  list,
  onOpen,
  opening,
}: {
  list: ToolManifest[]
  onOpen?: (tool: ToolManifest, event: MouseEvent<HTMLAnchorElement>) => void
  opening?: string
}) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
      {list.map((tool) => (
        <li key={tool.id}>
          <ToolLink
            tool={tool}
            onClick={onOpen && ((event) => onOpen(tool, event))}
            className="block h-full rounded-lg border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <span className="font-medium">{tool.name}</span>
            <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
              {opening === tool.id ? 'Opening…' : tool.description}
            </span>
          </ToolLink>
        </li>
      ))}
    </ul>
  )
}

const countOf = (n: number) => (n === 1 ? '1 tool' : `${n} tools`)

// A plain click, not one meant to open the tool in a new tab or window.
const plainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

function Home() {
  useTitle(SITE_NAME)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<File[]>()
  const [opening, setOpening] = useState<string>()
  const search = useRef<HTMLInputElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const finder = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const typed = query.trim()
  const found = typed ? searchTools(tools, typed) : tools
  const fit = chosen && toolsFor(tools, chosen)

  const choose = (list: FileList | null | undefined) => {
    const files = [...(list ?? [])]
    if (files.length) setChosen(files)
  }
  const dragging = usePageDrop(choose)

  useEffect(() => {
    if (chosen) heading.current?.focus()
  }, [chosen])

  const openTop = (event: FormEvent) => {
    event.preventDefault()
    const [first] = found
    if (!typed || !first) return
    if (first.isolated && !self.crossOriginIsolated) {
      location.assign(`/${first.id}`)
    } else {
      void navigate(`/${first.id}`)
    }
  }

  const openWith = (tool: ToolManifest, event: MouseEvent) => {
    if (!chosen || !plainClick(event)) return
    if (tool.isolated && !self.crossOriginIsolated) {
      event.preventDefault()
      setOpening(tool.id)
      void handOverAcrossLoad(tool.id, chosen).then(() =>
        location.assign(`/${tool.id}`),
      )
    } else {
      handOver(tool.id, chosen)
    }
  }

  const seeAll = () => {
    setChosen(undefined)
    requestAnimationFrame(() => finder.current?.focus())
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

      <input
        ref={picker}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          choose(event.target.files)
          event.target.value = ''
        }}
      />

      {chosen && fit ? (
        <section aria-labelledby="chosen" className="pb-8">
          <h2
            id="chosen"
            ref={heading}
            tabIndex={-1}
            className="text-lg font-medium break-words outline-none"
          >
            Tools for {filesTitle(chosen)}
          </h2>
          {chosen.length > 1 && (
            <p className="mt-1 text-sm break-words text-zinc-600 dark:text-zinc-400">
              {fileNames(chosen)}
            </p>
          )}
          {'tools' in fit ? (
            <ToolList list={fit.tools} onOpen={openWith} opening={opening} />
          ) : (
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">
              {fit.problem === 'unknown'
                ? unknownMessage(fit.kinds)
                : FIT_MESSAGES[fit.problem]}
            </p>
          )}
          <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            <button
              type="button"
              className={TEXT_BUTTON}
              onClick={() => picker.current?.click()}
            >
              Choose other files
            </button>
            <button type="button" className={TEXT_BUTTON} onClick={seeAll}>
              See all tools
            </button>
          </p>
        </section>
      ) : (
        <>
          <form role="search" onSubmit={openTop} className="relative">
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
              ref={search}
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
                  search.current?.focus()
                }}
                className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <Icon d={ICONS.remove} />
              </button>
            )}
          </form>
          <button
            ref={finder}
            type="button"
            onClick={() => picker.current?.click()}
            className={`mt-3 w-full rounded-lg border border-dashed px-4 py-3 text-sm text-zinc-600 transition dark:text-zinc-400 ${
              dragging
                ? 'border-accent bg-accent/5'
                : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:border-zinc-600 dark:hover:bg-zinc-900'
            }`}
          >
            <span className="pointer-coarse:hidden">
              Or drop files here to see the tools that open them, or{' '}
              <span className="text-link">browse</span>
            </span>
            <span className="hidden pointer-coarse:inline">
              Or choose files to see the tools that open them
            </span>
          </button>
          <p role="status" className="sr-only">
            {typed
              ? found.length
                ? countOf(found.length)
                : 'No tools found'
              : ''}
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
                  Nothing matches “{typed}”. Try a file type, like PDF or HEIC,
                  or what you want to do, like merge or compress.
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
      )}
    </>
  )
}

export default Home
