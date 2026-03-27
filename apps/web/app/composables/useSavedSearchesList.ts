interface SavedSearchRow {
  id: number
  name: string
  filter: Record<string, unknown>
  frequency: string
  paused: boolean
  lastNotifiedAt: string | null
  createdAt: string
  updatedAt: string
}

export function useSavedSearchesList() {
  const { data, refresh, status } = useFetch<{ savedSearches: SavedSearchRow[] }>(
    '/api/saved-searches',
    {
      key: 'saved-searches-list',
    },
  )

  const appFetch = useAppFetch()

  async function setPaused(id: number, paused: boolean) {
    await appFetch(`/api/saved-searches/${id}`, { method: 'PATCH', body: { paused } })
    await refresh()
  }

  async function setFrequency(id: number, frequency: 'instant' | 'daily' | 'weekly') {
    await appFetch(`/api/saved-searches/${id}`, { method: 'PATCH', body: { frequency } })
    await refresh()
  }

  async function remove(id: number) {
    await appFetch(`/api/saved-searches/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { data, status, refresh, setPaused, setFrequency, remove }
}
