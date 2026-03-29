import type { BoatInventoryBoat, BoatInventoryFilters } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SEARCH_PATH } from '~~/app/utils/boatBrowse'

function normalizeQueryValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumericFilter(value: string) {
  if (!value.trim()) return ''

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : ''
}

function createEmptyFilters(): BoatInventoryFilters {
  return {
    make: '',
    location: '',
    minPrice: '',
    maxPrice: '',
    minLength: '',
    maxLength: '',
  }
}

function routeQueryToFilters(query: Record<string, unknown>): BoatInventoryFilters {
  return {
    make: normalizeQueryValue(query.make),
    location: normalizeQueryValue(query.location),
    minPrice: normalizeNumericFilter(normalizeQueryValue(query.minPrice)),
    maxPrice: normalizeNumericFilter(normalizeQueryValue(query.maxPrice)),
    minLength: normalizeNumericFilter(normalizeQueryValue(query.minLength)),
    maxLength: normalizeNumericFilter(normalizeQueryValue(query.maxLength)),
  }
}

function filtersToQuery(filters: BoatInventoryFilters) {
  const query: Record<string, string> = {}

  if (filters.make.trim()) query.make = filters.make.trim()
  if (filters.location.trim()) query.location = filters.location.trim()
  if (filters.minPrice.trim()) query.minPrice = normalizeNumericFilter(filters.minPrice)
  if (filters.maxPrice.trim()) query.maxPrice = normalizeNumericFilter(filters.maxPrice)
  if (filters.minLength.trim()) query.minLength = normalizeNumericFilter(filters.minLength)
  if (filters.maxLength.trim()) query.maxLength = normalizeNumericFilter(filters.maxLength)

  return Object.fromEntries(Object.entries(query).filter(([, value]) => value))
}

function buildActiveFilterTags(filters: BoatInventoryFilters) {
  const tags: string[] = []

  if (filters.make) tags.push(`Make: ${filters.make}`)
  if (filters.location) tags.push(`Location: ${filters.location}`)
  if (filters.minPrice) tags.push(`Min $${Number(filters.minPrice).toLocaleString()}`)
  if (filters.maxPrice) tags.push(`Max $${Number(filters.maxPrice).toLocaleString()}`)
  if (filters.minLength) tags.push(`Min ${filters.minLength} ft`)
  if (filters.maxLength) tags.push(`Max ${filters.maxLength} ft`)

  return tags
}

export function useBoatInventorySearch(options: { limit?: number } = {}) {
  const route = useRoute()
  const router = useRouter()
  const limit = options.limit ?? 48

  const filters = ref<BoatInventoryFilters>(createEmptyFilters())

  function syncFiltersFromRoute() {
    filters.value = routeQueryToFilters(route.query)
  }

  syncFiltersFromRoute()

  watch(
    () => route.query,
    () => {
      syncFiltersFromRoute()
    },
  )

  const appliedFilters = computed(() => routeQueryToFilters(route.query))
  const requestQuery = computed(() => ({
    ...filtersToQuery(appliedFilters.value),
    limit: String(limit),
  }))

  const {
    data: boats,
    status,
    error,
  } = useFetch<BoatInventoryBoat[]>('/api/boats', {
    query: requestQuery,
    default: () => [],
    dedupe: 'cancel',
  })

  async function applyFilters() {
    await router.push({
      path: BOAT_INVENTORY_SEARCH_PATH,
      query: filtersToQuery(filters.value),
    })
  }

  async function clearFilters() {
    filters.value = createEmptyFilters()
    await router.push({ path: BOAT_INVENTORY_SEARCH_PATH })
  }

  const hasActiveFilters = computed(
    () => Object.keys(filtersToQuery(appliedFilters.value)).length > 0,
  )
  const activeFilterTags = computed(() => buildActiveFilterTags(appliedFilters.value))
  const resultsLabel = computed(() => {
    const count = boats.value.length

    if (!count && hasActiveFilters.value) return 'No boats match the current filters'
    if (!count) return 'No boats available yet'
    if (count === limit) return `Showing the first ${count} matching boats`
    return `${count} boats in view`
  })

  return {
    boats,
    status,
    error,
    filters,
    applyFilters,
    clearFilters,
    hasActiveFilters,
    activeFilterTags,
    resultsLabel,
  }
}
