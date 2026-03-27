export interface FavoriteListBoat {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  price: number | null
  city: string | null
  state: string | null
  location: string | null
  description: string | null
  sellerType: string | null
  source: string
  images: string[]
}

export function useFavoritesList() {
  const appFetch = useAppFetch()
  const { data, refresh, status } = useFetch<{
    favorites: { boatId: number; createdAt: string; boat: FavoriteListBoat | null }[]
  }>('/api/favorites', { key: 'favorites-list' })

  async function remove(boatId: number) {
    await appFetch(`/api/favorites/${boatId}`, { method: 'DELETE' })
    await refresh()
  }

  return { data, status, refresh, remove }
}
