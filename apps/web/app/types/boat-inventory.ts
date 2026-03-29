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

export interface BoatBrowseLink {
  label: string
  description: string
  to: RouteLocationRaw
  icon?: string
}
