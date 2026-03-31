import type {
  BoatInventoryActiveFilterChip,
  BoatInventoryBoat,
  BoatInventoryFilterKey,
  BoatInventoryFilters,
  BoatInventorySearchResponse,
  BoatInventorySort,
} from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SEARCH_PATH } from '~~/app/utils/boatBrowse'
import {
  boatInventoryFiltersToQuery,
  boatInventoryFilterQuerySignature,
  buildBoatInventoryNavigationQuery,
  createEmptyBoatInventoryFilters,
  DEFAULT_BOAT_INVENTORY_SORT,
  normalizeBoatInventoryPage,
  normalizeBoatInventorySort,
  routeQueryToBoatInventoryFilters,
} from '~~/app/utils/boatInventorySearch'

function buildActiveFilterChips(filters: BoatInventoryFilters): BoatInventoryActiveFilterChip[] {
  const chips: BoatInventoryActiveFilterChip[] = []

  if (filters.q) {
    const display = filters.q.length > 48 ? `${filters.q.slice(0, 45).trimEnd()}…` : filters.q
    chips.push({ key: 'q', label: 'Search', value: display })
  }
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
    sort: DEFAULT_BOAT_INVENTORY_SORT,
  }
}

function queriesMatch(a: BoatInventoryFilters, b: BoatInventoryFilters) {
  return boatInventoryFilterQuerySignature(a) === boatInventoryFilterQuerySignature(b)
}

export function useBoatInventorySearch(
  options: { limit?: number; geoMode?: 'all' | 'matched' } = {},
) {
  const route = useRoute()
  const router = useRouter()
  const limit = options.limit ?? 48
  const inventoryPath = computed(() => route.path || BOAT_INVENTORY_SEARCH_PATH)

  const draftFilters = ref<BoatInventoryFilters>(createEmptyBoatInventoryFilters())

  function syncDraftFiltersFromRoute() {
    draftFilters.value = routeQueryToBoatInventoryFilters(route.query)
  }

  syncDraftFiltersFromRoute()

  const appliedFilters = computed(() => routeQueryToBoatInventoryFilters(route.query))
  const appliedFilterSignature = computed(() =>
    boatInventoryFilterQuerySignature(appliedFilters.value),
  )

  watch(appliedFilterSignature, () => {
    syncDraftFiltersFromRoute()
  })

  const currentSort = computed(() => normalizeBoatInventorySort(route.query.sort))
  const currentPage = computed(() => normalizeBoatInventoryPage(route.query.page))
  const currentOffset = computed(() => (currentPage.value - 1) * limit)

  const requestQuery = computed(() => ({
    ...boatInventoryFiltersToQuery(appliedFilters.value),
    limit: String(limit),
    offset: String(currentOffset.value),
    sort: currentSort.value,
    geoMode: options.geoMode ?? 'all',
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
    await router.push({
      path: inventoryPath.value || BOAT_INVENTORY_SEARCH_PATH,
      query: buildBoatInventoryNavigationQuery({ filters, sort, page }),
      hash: route.hash || undefined,
    })
  }

  async function applyFilters() {
    await pushInventoryQuery(draftFilters.value, currentSort.value, 1)
  }

  async function clearFilters() {
    draftFilters.value = createEmptyBoatInventoryFilters()
    await pushInventoryQuery(createEmptyBoatInventoryFilters(), currentSort.value, 1)
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
    () => Object.keys(boatInventoryFiltersToQuery(appliedFilters.value)).length > 0,
  )
  const activeFilterChips = computed(() => buildActiveFilterChips(appliedFilters.value))
  const hasUnsavedChanges = computed(() => !queriesMatch(draftFilters.value, appliedFilters.value))
  const navigationQuery = computed(() =>
    buildBoatInventoryNavigationQuery({
      filters: hasUnsavedChanges.value ? draftFilters.value : appliedFilters.value,
      sort: currentSort.value,
      page: hasUnsavedChanges.value ? 1 : currentPage.value,
    }),
  )
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

    if (hasUnsavedChanges.value) {
      return 'Draft filters are staged locally. Press Search or Apply filters to refresh results.'
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
    navigationQuery,
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
