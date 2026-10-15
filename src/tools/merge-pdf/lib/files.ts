import { outputName } from '../../../engines/pdf/files'

/** The merged file's name: the first PDF's name plus "-merged". */
export function mergedFileName(firstName: string) {
  return outputName(firstName, 'merged')
}

/** Moves the item at `from` to `to`, returning a new list. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
