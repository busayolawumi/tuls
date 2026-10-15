import { zipSync } from 'fflate'

/**
 * Puts files into one ZIP. They're stored, not compressed: PDFs and images
 * are compressed already, so squeezing them again takes time and saves
 * almost nothing. Names must be different, or later files replace earlier
 * ones.
 */
export function zipFiles(
  files: { name: string; data: Uint8Array }[],
): Uint8Array<ArrayBuffer> {
  return zipSync(
    Object.fromEntries(files.map(({ name, data }) => [name, data])),
    { level: 0 },
  )
}
