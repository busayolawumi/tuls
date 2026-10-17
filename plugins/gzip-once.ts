import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

/**
 * Gzips a big engine file once, into `folder` (named after the engine's
 * version, in node_modules/.cache), and reuses it on later builds.
 */
export async function gzipOnce(source: string, folder: string) {
  const target = join(folder, `${basename(source)}.gz`)
  if (existsSync(target)) return target
  await mkdir(folder, { recursive: true })
  const partial = `${target}.${process.pid}.partial`
  await pipeline(
    createReadStream(source),
    createGzip({ level: 9 }),
    createWriteStream(partial),
  )
  await rename(partial, target)
  return target
}
