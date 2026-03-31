import type { BoatInventoryFilters, BoatInventorySort } from '~~/app/types/boat-inventory'

export const DEFAULT_BOAT_INVENTORY_SORT: BoatInventorySort = 'updated-desc'

function normalizeQueryValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumericFilter(value: string) {
  if (!value.trim()) return ''

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : ''
}

export function normalizeBoatInventoryPage(value: unknown) {
  if (typeof value !== 'string') return 1

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function normalizeBoatInventorySort(value: unknown): BoatInventorySort {
  if (value === 'price-asc') return value
  if (value === 'price-desc') return value
  if (value === 'year-desc') return value
  return DEFAULT_BOAT_INVENTORY_SORT
}

export function createEmptyBoatInventoryFilters(): BoatInventoryFilters {
  return {
    q: '',
    make: '',
    location: '',
    minPrice: '',
    maxPrice: '',
    minLength: '',
    maxLength: '',
  }
}

export function routeQueryToBoatInventoryFilters(
  query: Record<string, unknown>,
): BoatInventoryFilters {
  return {
    q: normalizeQueryValue(query.q),
    make: normalizeQueryValue(query.make),
    location: normalizeQueryValue(query.location),
    minPrice: normalizeNumericFilter(normalizeQueryValue(query.minPrice)),
    maxPrice: normalizeNumericFilter(normalizeQueryValue(query.maxPrice)),
    minLength: normalizeNumericFilter(normalizeQueryValue(query.minLength)),
    maxLength: normalizeNumericFilter(normalizeQueryValue(query.maxLength)),
  }
}

export function boatInventoryFiltersToQuery(filters: BoatInventoryFilters) {
  const query: Record<string, string> = {}

  if (filters.q.trim()) query.q = filters.q.trim()
  if (filters.make.trim()) query.make = filters.make.trim()
  if (filters.location.trim()) query.location = filters.location.trim()
  if (filters.minPrice.trim()) query.minPrice = normalizeNumericFilter(filters.minPrice)
  if (filters.maxPrice.trim()) query.maxPrice = normalizeNumericFilter(filters.maxPrice)
  if (filters.minLength.trim()) query.minLength = normalizeNumericFilter(filters.minLength)
  if (filters.maxLength.trim()) query.maxLength = normalizeNumericFilter(filters.maxLength)

  return Object.fromEntries(Object.entries(query).filter(([, value]) => value))
}

export function boatInventoryFilterQuerySignature(filters: BoatInventoryFilters) {
  return JSON.stringify(boatInventoryFiltersToQuery(filters))
}

export function buildBoatInventoryNavigationQuery(options: {
  filters: BoatInventoryFilters
  sort?: BoatInventorySort
  page?: number
}) {
  const query: Record<string, string> = {
    ...boatInventoryFiltersToQuery(options.filters),
  }

  if (options.sort && options.sort !== DEFAULT_BOAT_INVENTORY_SORT) {
    query.sort = options.sort
  }

  if ((options.page ?? 1) > 1) {
    query.page = String(options.page)
  }

  return query
}
