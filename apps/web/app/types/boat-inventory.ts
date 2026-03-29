import type { RouteLocationRaw } from 'vue-router'

export interface BoatInventoryBoat {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  city: string | null
  state: string | null
  location: string | null
  price: number | null
  description: string | null
  sellerType: string | null
  source: string
  images: string[]
}

export interface BoatInventoryStats {
  total: number
  uniqueMakes: number
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
  minYear: number | null
  maxYear: number | null
  topMakes: { make: string; count: number }[]
}

export interface BoatInventoryFilters {
  make: string
  location: string
  minPrice: string
  maxPrice: string
  minLength: string
  maxLength: string
}

export type BoatInventorySort = 'updated-desc' | 'price-asc' | 'price-desc' | 'year-desc'

export type BoatInventoryFilterKey = keyof BoatInventoryFilters

export interface BoatInventoryActiveFilterChip {
  key: BoatInventoryFilterKey
  label: string
  value: string
}

export interface BoatInventorySearchResponse {
  items: BoatInventoryBoat[]
  total: number
  limit: number
  offset: number
  page: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  sort: BoatInventorySort
}

export const BOAT_INVENTORY_SORT_OPTIONS: Array<{ label: string; value: BoatInventorySort }> = [
  { label: 'Recently updated', value: 'updated-desc' },
  { label: 'Price: low to high', value: 'price-asc' },
  { label: 'Price: high to low', value: 'price-desc' },
  { label: 'Model year: newest', value: 'year-desc' },
]

export interface BoatBrowseLink {
  label: string
  description: string
  to: RouteLocationRaw
  icon?: string
  chips?: string[]
}
