import type { RouteLocationRaw } from 'vue-router'

export interface BoatInventoryBoat {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  city: string | null
  state: string | null
  country: string | null
  location: string | null
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoLat: number | null
  geoLng: number | null
  geoPrecision: string | null
  geoStatus: string | null
  price: number | null
  description: string | null
  sellerType: string | null
  source: string
  url: string | null
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
  q: string
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
  { label: 'Newest listings', value: 'updated-desc' },
  { label: 'Lowest price', value: 'price-asc' },
  { label: 'Highest price', value: 'price-desc' },
  { label: 'Newest model year', value: 'year-desc' },
]

export interface BoatBrowseLink {
  label: string
  description: string
  to: RouteLocationRaw
  icon?: string
  chips?: string[]
}
