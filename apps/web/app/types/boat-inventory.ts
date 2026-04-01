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

export const BOAT_INVENTORY_VESSEL_MODE_VALUES = ['power', 'sail'] as const

export type BoatInventoryVesselMode = (typeof BOAT_INVENTORY_VESSEL_MODE_VALUES)[number]

export const BOAT_INVENTORY_VESSEL_MODE_OPTIONS: Array<{
  value: BoatInventoryVesselMode
  label: string
  icon: string
}> = [
  { value: 'power', label: 'Power', icon: 'i-lucide-zap' },
  { value: 'sail', label: 'Sail', icon: 'i-lucide-wind' },
]

export const BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES = [
  'power-center-console',
  'power-sportfish',
  'power-catamaran',
  'power-cruiser',
  'sail-sloop',
  'sail-catamaran',
  'sail-cruiser',
] as const

export type BoatInventoryVesselSubtype = (typeof BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES)[number]

export const BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE: Record<
  BoatInventoryVesselSubtype,
  BoatInventoryVesselMode
> = {
  'power-center-console': 'power',
  'power-sportfish': 'power',
  'power-catamaran': 'power',
  'power-cruiser': 'power',
  'sail-sloop': 'sail',
  'sail-catamaran': 'sail',
  'sail-cruiser': 'sail',
}

export const BOAT_INVENTORY_VESSEL_SUBTYPE_OPTIONS: Record<
  BoatInventoryVesselMode,
  ReadonlyArray<{ value: BoatInventoryVesselSubtype; label: string }>
> = {
  power: [
    { value: 'power-center-console', label: 'Center console' },
    { value: 'power-sportfish', label: 'Sportfish' },
    { value: 'power-catamaran', label: 'Catamaran' },
    { value: 'power-cruiser', label: 'Cruiser' },
  ],
  sail: [
    { value: 'sail-sloop', label: 'Sloop' },
    { value: 'sail-catamaran', label: 'Catamaran' },
    { value: 'sail-cruiser', label: 'Cruiser' },
  ],
}

export function getBoatInventoryVesselSubtypeLabel(subtype: BoatInventoryVesselSubtype) {
  for (const mode of BOAT_INVENTORY_VESSEL_MODE_VALUES) {
    const match = BOAT_INVENTORY_VESSEL_SUBTYPE_OPTIONS[mode].find(
      (option) => option.value === subtype,
    )
    if (match) return match.label
  }

  return subtype
}

export interface BoatInventoryFilters {
  q: string
  make: string
  location: string
  minPrice: string
  maxPrice: string
  minLength: string
  maxLength: string
  vesselMode: '' | BoatInventoryVesselMode
  vesselSubtype: '' | BoatInventoryVesselSubtype
}

export interface BoatInventoryBudgetPreset {
  label: string
  minPrice: string
  maxPrice: string
}

export const BOAT_INVENTORY_BUDGET_PRESETS: BoatInventoryBudgetPreset[] = [
  { label: 'Under $50k', minPrice: '', maxPrice: '50000' },
  { label: '$50k-$100k', minPrice: '50000', maxPrice: '100000' },
  { label: '$100k-$250k', minPrice: '100000', maxPrice: '250000' },
  { label: '$250k-$500k', minPrice: '250000', maxPrice: '500000' },
  { label: '$500k-$1M', minPrice: '500000', maxPrice: '1000000' },
  { label: '$1M+', minPrice: '1000000', maxPrice: '' },
]

export interface BoatInventoryLengthPreset {
  label: string
  minLength: string
  maxLength: string
}

export const BOAT_INVENTORY_LENGTH_PRESETS: BoatInventoryLengthPreset[] = [
  { label: 'Under 24 ft', minLength: '', maxLength: '24' },
  { label: '24-30 ft', minLength: '24', maxLength: '30' },
  { label: '30-36 ft', minLength: '30', maxLength: '36' },
  { label: '36-45 ft', minLength: '36', maxLength: '45' },
  { label: '45-60 ft', minLength: '45', maxLength: '60' },
  { label: '60+ ft', minLength: '60', maxLength: '' },
]

export interface BoatInventoryAutocompleteSuggestion {
  label: string
  value: string
  count?: number
}

export interface BoatInventoryAutocompleteFieldState {
  enabled: boolean
  loading: boolean
  items: BoatInventoryAutocompleteSuggestion[]
  helperText: string
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
