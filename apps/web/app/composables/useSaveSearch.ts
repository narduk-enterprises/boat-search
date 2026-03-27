/**
 * Create a saved search (auth required). Caller should navigate to /login when !loggedIn.
 */
export function useSaveSearch() {
  const appFetch = useAppFetch()
  const { capture } = usePosthog()

  return {
    async save(
      name: string,
      filter: Record<string, unknown>,
      frequency: 'instant' | 'daily' | 'weekly' = 'daily',
    ) {
      const res = await appFetch<{ id?: number }>('/api/saved-searches', {
        method: 'POST',
        body: { name, filter, frequency },
      })
      capture('saved_search_created', { name, frequency })
      return res
    },
  }
}
