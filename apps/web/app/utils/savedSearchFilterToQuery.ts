/**
 * Maps a saved-search filter object to public inventory search query params.
 */
export function savedSearchFilterToQuery(filter: Record<string, unknown>): Record<string, string> {
  const q: Record<string, string> = {}
  if (typeof filter.q === 'string' && filter.q.trim()) q.q = filter.q.trim()
  if (typeof filter.make === 'string' && filter.make.trim()) q.make = filter.make.trim()
  if (typeof filter.location === 'string' && filter.location.trim())
    q.location = filter.location.trim()
  for (const key of ['minPrice', 'maxPrice', 'minLength', 'maxLength'] as const) {
    const v = filter[key]
    if (v == null || v === '') continue
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isNaN(n)) q[key] = String(n)
  }
  return q
}
