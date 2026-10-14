import { useTitle } from '../lib/useTitle.ts'

function Home() {
  useTitle('Tuls')
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-12 text-center sm:py-20">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        Everyday file tools.
      </h1>
      <p className="mt-4 max-w-md text-zinc-600 dark:text-zinc-400">
        Convert, compress and fix files in your browser. Nothing is uploaded.
      </p>
    </section>
  )
}

export default Home
