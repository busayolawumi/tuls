/** Moves the card `id` to where the card `to` is now, in a new list. */
export function moveTo<T extends { id: string }>(
  list: T[],
  id: string,
  to: string,
): T[] {
  const from = list.findIndex((item) => item.id === id)
  const at = list.findIndex((item) => item.id === to)
  if (from < 0 || at < 0 || from === at) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(at, 0, item)
  return next
}
