import type {
  BoatInventoryActiveFilterChip,
  BoatInventoryBoat,
  BoatInventoryFilterKey,
  BoatInventoryFilters,
  BoatInventorySearchResponse,
  BoatInventorySort,
} from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SEARCH_PATH } from '~~/app/utils/boatBrowse'

const DEFAULT_SORT: BoatInventorySort = 'updated-desc'

function normalizeQueryValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumericFilter(value: string) {
  if (!value.trim()) return ''

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : ''
}

function normalizePage(value: unknown) {
  if (typeof value !== 'string') return 1

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function normalizeSort(value: unknown): BoatInventorySort {
  if (value === 'price-asc') return value
  if (value === 'price-desc') return value
  if (value === 'year-desc') return value
  return DEFAULT_SORT
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

function buildActiveFilterChips(filters: BoatInventoryFilters): BoatInventoryActiveFilterChip[] {
  const chips: BoatInventoryActiveFilterChip[] = []

  if (filters.make) {
    chips.push({ key: 'make', label: 'Make', value: filters.make })
  }
  if (filters.location) {
    chips.push({ key: 'location', label: 'Location', value: filters.location })
  }
  if (filters.minPrice) {
    chips.push({
      key: 'minPrice',
      label: 'Min price',
      value: `$${Number(filters.minPrice).toLocaleString()}`,
    })
  }
  if (filters.maxPrice) {
    chips.push({
      key: 'maxPrice',
      label: 'Max price',
      value: `$${Number(filters.maxPrice).toLocaleString()}`,
    })
  }
  if (filters.minLength) {
    chips.push({ key: 'minLength', label: 'Min length', value: `${filters.minLength} ft` })
  }
  if (filters.maxLength) {
    chips.push({ key: 'maxLength', label: 'Max length', value: `${filters.maxLength} ft` })
  }

  return chips
}

function createEmptyResponse(limit: number): BoatInventorySearchResponse {
  return {
    items: [],
    total: 0,
    limit,
    offset: 0,
    page: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    sort: DEFAULT_SORT,
  }
}

function queriesMatch(a: BoatInventoryFilters, b: BoatInventoryFilters) {
  return JSON.stringify(filtersToQuery(a)) === JSON.stringify(filtersToQuery(b))
}

export function useBoatInventorySearch(options: { limit?: number } = {}) {
  const route = useRoute()
  const router = useRouter()
  const limit = options.limit ?? 48

  const draftFilters = ref<BoatInventoryFilters>(createEmptyFilters())

  function syncDraftFiltersFromRoute() {
    draftFilters.value = routeQueryToFilters(route.query)
  }

  syncDraftFiltersFromRoute()

  watch(
    () => route.query,
    () => {
      syncDraftFiltersFromRoute()
    },
  )

  const appliedFilters = computed(() => routeQueryToFilters(route.query))
  const currentSort = computed(() => normalizeSort(route.query.sort))
  const currentPage = computed(() => normalizePage(route.query.page))
  const currentOffset = computed(() => (currentPage.value - 1) * limit)

  const requestQuery = computed(() => ({
    ...filtersToQuery(appliedFilters.value),
    limit: String(limit),
    offset: String(currentOffset.value),
    sort: currentSort.value,
  }))

  const { data, status, error, refresh } = useFetch<BoatInventorySearchResponse>('/api/boats', {
    query: requestQuery,
    default: () => createEmptyResponse(limit),
    dedupe: 'cancel',
  })

  async function pushInventoryQuery(
    filters: BoatInventoryFilters,
    sort: BoatInventorySort,
    page: number,
  ) {
    const query: Record<string, string> = {
      ...filtersToQuery(filters),
    }

    if (sort !== DEFAULT_SORT) {
      query.sort = sort
    }

    if (page > 1) {
      query.page = String(page)
    }

    await router.push({
      path: BOAT_INVENTORY_SEARCH_PATH,
      query,
      hash: route.hash || undefined,
    })
  }

  async function applyFilters() {
    await pushInventoryQuery(draftFilters.value, currentSort.value, 1)
  }

  async function clearFilters() {
    draftFilters.value = createEmptyFilters()
    await pushInventoryQuery(createEmptyFilters(), currentSort.value, 1)
  }

  async function removeFilter(key: BoatInventoryFilterKey) {
    const nextFilters = {
      ...appliedFilters.value,
      [key]: '',
    }

    draftFilters.value = {
      ...draftFilters.value,
      [key]: '',
    }

    await pushInventoryQuery(nextFilters, currentSort.value, 1)
  }

  async function setSort(sort: BoatInventorySort) {
    if (sort === currentSort.value) return
    await pushInventoryQuery(appliedFilters.value, sort, 1)
  }

  async function goToPage(page: number) {
    await pushInventoryQuery(appliedFilters.value, currentSort.value, page)
  }

  const boats = computed<BoatInventoryBoat[]>(() => data.value.items)
  const total = computed(() => data.value.total)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / limit)))
  const hasActiveFilters = computed(
    () => Object.keys(filtersToQuery(appliedFilters.value)).length > 0,
  )
  const activeFilterChips = computed(() => buildActiveFilterChips(appliedFilters.value))
  const hasUnsavedChanges = computed(() => !queriesMatch(draftFilters.value, appliedFilters.value))
  const visibleStart = computed(() => (boats.value.length ? currentOffset.value + 1 : 0))
  const visibleEnd = computed(() => currentOffset.value + boats.value.length)
  const resultsLabel = computed(() => {
    if (!total.value && hasActiveFilters.value) return 'No boats match the current filters'
    if (!total.value) return 'No boats available yet'
    return `${visibleStart.value}-${visibleEnd.value} of ${total.value} boats`
  })
  const resultsContext = computed(() => {
    if (!total.value && hasActiveFilters.value) {
      return 'Widen the price or length band, or remove make and location filters.'
    }

    if (!total.value) {
      return 'Inventory is still filling in. Check back after the next import run.'
    }

    if (activeFilterChips.value.length) {
      return activeFilterChips.value.map((chip) => `${chip.label}: ${chip.value}`).join(' · ')
    }

    return 'Newest listings first. Use the floating bar to sort or filter the list at any time.'
  })

  return {
    boats,
    status,
    error,
    draftFilters,
    appliedFilters,
    currentSort,
    currentPage,
    total,
    pageCount,
    hasNextPage: computed(() => data.value.hasNextPage),
    hasPreviousPage: computed(() => data.value.hasPreviousPage),
    hasActiveFilters,
    hasUnsavedChanges,
    activeFilterChips,
    resultsLabel,
    resultsContext,
    applyFilters,
    clearFilters,
    removeFilter,
    setSort,
    goToPage,
    retry: refresh,
  }
}
