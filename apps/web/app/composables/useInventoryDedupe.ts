export interface InventoryDedupeBoatSummary {
  id: number
  source: string
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  price: string | null
  city: string | null
  state: string | null
  updatedAt: string
  dedupeMethod: string | null
  dedupeConfidence: number | null
}

export interface InventoryDedupeResponse {
  summary: {
    activeListings: number
    supersededListings: number
    canonicalEntities: number
    multiListingEntities: number
    openCandidatePairs: number
  }
  entities: {
    entityId: number
    representativeBoatId: number | null
    memberCount: number
    boats: InventoryDedupeBoatSummary[]
  }[]
  candidates: {
    id: number
    confidenceScore: number
    ruleHits: string[]
    updatedAt: string
    leftBoat: InventoryDedupeBoatSummary
    rightBoat: InventoryDedupeBoatSummary
  }[]
}

export function useInventoryDedupe() {
  return useFetch<InventoryDedupeResponse>('/api/admin/inventory-dedupe', {
    key: 'inventory-dedupe',
  })
}
