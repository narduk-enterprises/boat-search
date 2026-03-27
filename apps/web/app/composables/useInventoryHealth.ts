interface InventoryHealthResponse {
  overview: {
    totalBoats: number
    staleBoats: number
    freshBoats: number
    failedCrawls: number
    partialCrawls: number
    lastUpdatedAt: string | null
    lastScrapedAt: string | null
  }
  sources: {
    source: string
    count: number
    latestUpdatedAt: string | null
  }[]
  recentCrawls: {
    id: number
    searchUrl: string
    status: string
    boatsFound: number | null
    boatsScraped: number | null
    startedAt: string
    completedAt: string | null
    error: string | null
  }[]
}

export function useInventoryHealth() {
  return useFetch<InventoryHealthResponse>('/api/admin/inventory-health', {
    key: 'inventory-health',
  })
}
