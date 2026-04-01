import type {
  BoatInventoryFilterKey,
  BoatInventoryFilters,
  BoatInventorySort,
  BoatInventoryVesselMode,
  BoatInventoryVesselSubtype,
} from '~~/app/types/boat-inventory'
import {
  BOAT_INVENTORY_VESSEL_MODE_VALUES,
  BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE,
  BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES,
} from '~~/app/types/boat-inventory'

export const DEFAULT_BOAT_INVENTORY_SORT: BoatInventorySort = 'updated-desc'

function normalizeVesselMode(value: unknown): '' | BoatInventoryVesselMode {
  if (typeof value !== 'string') return ''

  return BOAT_INVENTORY_VESSEL_MODE_VALUES.includes(value as BoatInventoryVesselMode)
    ? (value as BoatInventoryVesselMode)
    : ''
}

function normalizeVesselSubtype(value: unknown): '' | BoatInventoryVesselSubtype {
  if (typeof value !== 'string') return ''

  return BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES.includes(value as BoatInventoryVesselSubtype)
    ? (value as BoatInventoryVesselSubtype)
    : ''
}

function normalizeQueryValue(value: unknown) {
  return value != null && value !== '' ? String(value).trim() : ''
}

function normalizeNumericFilter(value: unknown) {
  if (value == null || value === '') return ''
  const strVal = String(value).trim()
  if (!strVal) return ''

  const parsed = Number(strVal)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : ''
}

export function normalizeBoatInventoryPage(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 1
  }
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
    vesselMode: '',
    vesselSubtype: '',
  }
}

export function routeQueryToBoatInventoryFilters(
  query: Record<string, unknown>,
): BoatInventoryFilters {
  const vesselSubtype = normalizeVesselSubtype(normalizeQueryValue(query.vesselSubtype))
  const inferredMode = vesselSubtype ? BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[vesselSubtype] : ''
  const vesselMode = normalizeVesselMode(normalizeQueryValue(query.vesselMode)) || inferredMode

  return {
    q: normalizeQueryValue(query.q),
    make: normalizeQueryValue(query.make),
    location: normalizeQueryValue(query.location),
    minPrice: normalizeNumericFilter(normalizeQueryValue(query.minPrice)),
    maxPrice: normalizeNumericFilter(normalizeQueryValue(query.maxPrice)),
    minLength: normalizeNumericFilter(normalizeQueryValue(query.minLength)),
    maxLength: normalizeNumericFilter(normalizeQueryValue(query.maxLength)),
    vesselMode,
    vesselSubtype:
      vesselSubtype && BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[vesselSubtype] === vesselMode
        ? vesselSubtype
        : '',
  }
}

export function boatInventoryFiltersToQuery(filters: BoatInventoryFilters) {
  const query: Record<string, string> = {}

  const q = String(filters.q ?? '').trim()
  const make = String(filters.make ?? '').trim()
  const location = String(filters.location ?? '').trim()
  const minPrice = normalizeNumericFilter(filters.minPrice)
  const maxPrice = normalizeNumericFilter(filters.maxPrice)
  const minLength = normalizeNumericFilter(filters.minLength)
  const maxLength = normalizeNumericFilter(filters.maxLength)
  const vesselSubtype = normalizeVesselSubtype(filters.vesselSubtype)
  const vesselMode =
    normalizeVesselMode(filters.vesselMode) ||
    (vesselSubtype ? BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[vesselSubtype] : '')

  if (q) query.q = q
  if (make) query.make = make
  if (location) query.location = location
  if (minPrice) query.minPrice = minPrice
  if (maxPrice) query.maxPrice = maxPrice
  if (minLength) query.minLength = minLength
  if (maxLength) query.maxLength = maxLength
  if (vesselMode) query.vesselMode = vesselMode
  if (vesselSubtype && BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[vesselSubtype] === vesselMode) {
    query.vesselSubtype = vesselSubtype
  }

  return query
}

export function boatInventoryFilterQuerySignature(filters: BoatInventoryFilters) {
  return JSON.stringify(boatInventoryFiltersToQuery(filters))
}

export function clearBoatInventoryFilter(
  filters: BoatInventoryFilters,
  key: BoatInventoryFilterKey,
): BoatInventoryFilters {
  const nextFilters = {
    ...filters,
    [key]: '',
  }

  if (key === 'vesselMode') {
    nextFilters.vesselSubtype = ''
  }

  return nextFilters
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
