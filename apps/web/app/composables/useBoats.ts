/**
 * Composable for boat data fetching and xAI analysis.
 *
 * Follows Thin Component / Thick Composable pattern.
 */

import type {
  BoatInventorySearchResponse,
  BoatInventorySort,
  BoatInventoryVesselMode,
  BoatInventoryVesselSubtype,
} from '~~/app/types/boat-inventory'

interface Boat {
  id: number
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: number | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoLat: number | null
  geoLng: number | null
  geoPrecision: string | null
  geoStatus: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  scrapedAt: string
}

interface BoatStats {
  total: number
  uniqueMakes: number
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
  minYear: number | null
  maxYear: number | null
  topMakes: { make: string; count: number }[]
}

interface BoatFilters {
  make?: string
  location?: string
  minLength?: number
  maxLength?: number
  minPrice?: number
  maxPrice?: number
  vesselMode?: BoatInventoryVesselMode
  vesselSubtype?: BoatInventoryVesselSubtype
  limit?: number
  offset?: number
  sort?: BoatInventorySort
}

interface AnalysisResult {
  analysis: string
  boatCount: number
  category: string
  tokensUsed: number
  boatMap: Record<
    number,
    {
      images: string[]
      make: string | null
      model: string | null
      year: number | null
      price: string | null
      length: string | null
      location: string | null
      url: string | null
    }
  >
}

export function useBoats() {
  const appFetch = useAppFetch()

  const fetchBoats = (filters: BoatFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.make) params.set('make', filters.make)
    if (filters.location) params.set('location', filters.location)
    if (filters.minLength) params.set('minLength', String(filters.minLength))
    if (filters.maxLength) params.set('maxLength', String(filters.maxLength))
    if (filters.minPrice) params.set('minPrice', String(filters.minPrice))
    if (filters.maxPrice) params.set('maxPrice', String(filters.maxPrice))
    if (filters.vesselMode) params.set('vesselMode', filters.vesselMode)
    if (filters.vesselSubtype) params.set('vesselSubtype', filters.vesselSubtype)
    if (filters.limit) params.set('limit', String(filters.limit))
    if (filters.offset) params.set('offset', String(filters.offset))
    if (filters.sort) params.set('sort', filters.sort)

    const qs = params.toString()
    return useFetch<BoatInventorySearchResponse>(`/api/boats${qs ? `?${qs}` : ''}`)
  }

  const fetchBoatStats = () => {
    return useFetch<BoatStats>('/api/boats/stats')
  }

  const fetchBoat = (id: number | string) => {
    return useFetch<Boat>(`/api/boats/${id}`)
  }

  const triggerAnalysis = async (options?: {
    category?: string
    make?: string
    minLength?: number
    maxLength?: number
    userContext?: string
  }) => {
    return appFetch<AnalysisResult>('/api/boats/analyze', {
      method: 'POST',
      body: {
        category: options?.category || '',
        make: options?.make,
        minLength: options?.minLength,
        maxLength: options?.maxLength,
        userContext: options?.userContext || undefined,
      },
    })
  }

  return {
    fetchBoats,
    fetchBoatStats,
    fetchBoat,
    triggerAnalysis,
  }
}
