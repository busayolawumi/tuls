/** Fails with `late()` if `promise` takes longer than `ms`. */
export function within<T>(
  promise: Promise<T>,
  ms: number,
  late: () => unknown,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const tooLate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(late()), ms)
  })
  return Promise.race([promise, tooLate]).finally(() => clearTimeout(timer))
}
