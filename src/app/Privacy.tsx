import { useTitle } from '../lib/useTitle.ts'
import { SOURCE_URL } from '../site.ts'

const link = 'text-link underline underline-offset-4 hover:no-underline'

function Privacy() {
  useTitle('Privacy · Tuls')
  return (
    <article className="mx-auto w-full max-w-xl py-10 text-left sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Privacy
      </h1>
      <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
        Your files never leave your device. Every tool runs in your browser, so
        nothing you open in Tuls is uploaded anywhere.
      </p>

      <div className="mt-10 space-y-8 text-zinc-700 dark:text-zinc-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-900 dark:[&_h2]:text-zinc-100 [&_li]:mt-2 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Your files</h2>
          <p>
            When you choose a file, your browser reads it and the tool works on
            it right there, on your device. The result is made there too, and
            saved only when you download or share it.
          </p>
          <p>
            This isn’t just a promise. The site tells your browser not to
            connect to any other site while you use it, and Tuls’s own tests
            check that no request leaves the site while a tool is working.
          </p>
        </section>

        <section>
          <h2>What Tuls downloads</h2>
          <p>
            Some tools need a converter, such as the one for Word documents or
            the text reader. It comes from this site the first time you use the
            tool, and your browser keeps it, so it doesn’t have to download
            again. Nothing about your files is sent to get it.
          </p>
        </section>

        <section>
          <h2>What stays on your device</h2>
          <ul>
            <li>
              The choices you make in some tools, such as an image format, a
              page size or a language, so they’re ready next time.
            </li>
            <li>
              A note while a long job runs, saying only when it started, so Tuls
              can tell you if the page closed halfway through.
            </li>
            <li>The converters Tuls has downloaded, as above.</li>
            <li>
              Files you drop on the home page and then open in a Word, Excel or
              PowerPoint tool, for the moment it takes that page to load. They
              are deleted as soon as it opens, and ignored after two minutes.
            </li>
          </ul>
          <p>
            All of it stays in your browser, where only Tuls can read it.
            Clearing this site’s data in your browser’s settings removes it.
          </p>
        </section>

        <section>
          <h2>The files you get</h2>
          <p>
            Tuls removes hidden details it would otherwise copy across, such as
            a photo’s location and camera, and a document’s author and title.
          </p>
        </section>

        <section>
          <h2>No tracking</h2>
          <p>
            There are no accounts, cookies, analytics, adverts or trackers. Tuls
            doesn’t know who uses it or what for.
          </p>
          <p>
            The site is hosted by Vercel. Like any web host, it receives what
            your browser sends when it loads a page, such as your IP address.
            Tuls itself collects nothing.
          </p>
        </section>

        <section>
          <h2>Check for yourself</h2>
          <p>
            Tuls’s code is open:{' '}
            <a className={link} href={SOURCE_URL}>
              read it on GitHub
            </a>
            . You can also open your browser’s developer tools while you use a
            tool, and watch that no file goes anywhere.
          </p>
        </section>
      </div>
    </article>
  )
}

export default Privacy
