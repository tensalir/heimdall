/**
 * Bounded-concurrency map. ISOMORPHIC.
 * The repo has no such helper; this is the smallest correct one.
 */

/** Run `fn` over `items` with at most `limit` in flight. Preserves input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const size = Math.max(1, Math.min(limit, items.length))
  const results = new Array<R>(items.length)
  let next = 0

  const workers = Array.from({ length: size }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  })

  await Promise.all(workers)
  return results
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
