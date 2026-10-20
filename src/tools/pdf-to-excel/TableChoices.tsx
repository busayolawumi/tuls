import type { ReactNode } from 'react'
import type { FoundTable } from '../../engines/pymupdf/worker'
import { pagesName, PREVIEW_ROWS, scannedNote, sizeLabel } from './lib/tables'

export type Item = {
  file: File
  pages: number
  scanned: number[]
  picture: string | null
  tables: FoundTable[]
  chosen: boolean[]
}

type Props = {
  items: Item[]
  problems: ReactNode
  onToggle: (item: number, table: number) => void
  onMake: () => void
  onStartOver: () => void
}

export function TableChoices({
  items,
  problems,
  onToggle,
  onMake,
  onStartOver,
}: Props) {
  const files = items.filter((item) => item.chosen.some(Boolean)).length
  const found = items.some((item) => item.tables.length > 0)
  const several = items.length > 1

  return (
    <div className="mt-6 w-full max-w-xl text-left sm:mt-8">
      {found ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Untick anything that isn’t a table you want. Each table becomes a
          sheet.
        </p>
      ) : (
        <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h2 className="font-medium">No tables found</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Tuls looks for text set out in rows and columns. If the tables are
            pictures, as in scans, it can’t read them yet.
          </p>
        </div>
      )}

      {items.map((item, i) => {
        const note = scannedNote(item.scanned)
        return (
          // Two PDFs can share a name.
          <section
            key={i}
            className="mt-6"
            aria-label={several ? item.file.name : undefined}
          >
            {several && (
              <h2
                className="truncate text-sm font-medium"
                title={item.file.name}
              >
                {item.file.name}
              </h2>
            )}
            {note && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                {note}
              </p>
            )}
            {item.tables.length === 0 && found && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                No tables found in it.
              </p>
            )}
            <ul className="mt-2 space-y-3">
              {item.tables.map((table, j) => (
                <TableCard
                  key={j}
                  table={table}
                  chosen={item.chosen[j]}
                  onToggle={() => onToggle(i, j)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {problems}

      {found && (
        <>
          <button
            type="button"
            onClick={onMake}
            disabled={files === 0}
            aria-describedby={files === 0 ? 'nothing-chosen' : undefined}
            className="mt-6 w-full cursor-pointer rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:hover:bg-zinc-100"
          >
            {files > 1 ? `Make ${files} Excel files` : 'Make Excel file'}
          </button>
          {files === 0 && (
            <p
              id="nothing-chosen"
              className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400"
            >
              Tick at least one table.
            </p>
          )}
        </>
      )}
      <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          className="-mx-2 -my-3.5 cursor-pointer px-2 py-3.5 underline-offset-4 hover:underline"
          onClick={onStartOver}
        >
          Choose other PDFs
        </button>
      </p>
    </div>
  )
}

function TableCard({
  table,
  chosen,
  onToggle,
}: {
  table: FoundTable
  chosen: boolean
  onToggle: () => void
}) {
  const shown = table.rows.slice(0, table.header + PREVIEW_ROWS)
  const more = table.rows.length - shown.length
  const name = `${pagesName(table.pages)}, ${sizeLabel(table)}`
  return (
    <li
      className={`rounded-lg border transition-colors ${
        chosen
          ? 'border-zinc-300 dark:border-zinc-700'
          : 'border-dashed border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent">
        <input
          type="checkbox"
          checked={chosen}
          onChange={onToggle}
          aria-label={name}
          className="size-[1.125rem] shrink-0 cursor-pointer accent-accent outline-none"
        />
        <span className="text-sm font-medium">{pagesName(table.pages)}</span>
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {sizeLabel(table)}
        </span>
      </label>
      <div
        className={`overflow-x-auto border-t border-zinc-200 dark:border-zinc-800 ${
          chosen ? '' : 'opacity-40'
        }`}
      >
        <table
          aria-label={`The first rows of ${pagesName(table.pages).toLowerCase()}`}
          className="w-full text-xs"
        >
          <tbody>
            {shown.map((row, r) => (
              <tr
                key={r}
                className={
                  r < table.header
                    ? 'font-medium'
                    : 'text-zinc-600 dark:text-zinc-400'
                }
              >
                {row.map((cell, c) =>
                  cell === null ? null : (
                    <td
                      key={c}
                      colSpan={span(row, c)}
                      className={`max-w-48 truncate px-3 py-1.5 whitespace-nowrap ${
                        r >= table.header && NUMBER.test(cell)
                          ? 'text-right'
                          : ''
                      }`}
                      title={cell}
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {more > 0 && (
          <p className="px-3 pb-2 text-xs text-zinc-500 dark:text-zinc-400">
            and {more} more {more === 1 ? 'row' : 'rows'}
          </p>
        )}
      </div>
    </li>
  )
}

const NUMBER = /^[(\-−+]?[£$€₦¥₹]?\s?\d[\d,.\s]*%?\)?(-|\s?(CR|DR|OD))?$/

function span(row: (string | null)[], column: number) {
  let end = column
  while (row[end + 1] === null) end++
  return end - column + 1
}
