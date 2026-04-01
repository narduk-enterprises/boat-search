import { describe, expect, it } from 'vitest'
import {
  BOAT_INVENTORY_BUDGET_PRESETS,
  BOAT_INVENTORY_LENGTH_PRESETS,
} from '~~/app/types/boat-inventory'
import {
  boatInventoryFilterQuerySignature,
  buildBoatInventoryNavigationQuery,
  clearBoatInventoryFilter,
  createEmptyBoatInventoryFilters,
  routeQueryToBoatInventoryFilters,
} from '~~/app/utils/boatInventorySearch'

describe('routeQueryToBoatInventoryFilters', () => {
  it('normalizes query strings and strips invalid numeric filters', () => {
    expect(
      routeQueryToBoatInventoryFilters({
        q: '  Boston Whaler  ',
        make: '  Grady-White ',
        minPrice: '50000',
        maxPrice: '-100',
        minLength: ' 24 ',
        maxLength: 'abc',
      }),
    ).toEqual({
      q: 'Boston Whaler',
      make: 'Grady-White',
      location: '',
      minPrice: '50000',
      maxPrice: '',
      minLength: '24',
      maxLength: '',
      vesselMode: '',
      vesselSubtype: '',
    })
  })

  it('infers vessel mode from a valid subtype and drops invalid subtype/mode pairs', () => {
    expect(
      routeQueryToBoatInventoryFilters({
        vesselSubtype: 'power-center-console',
      }),
    ).toMatchObject({
      vesselMode: 'power',
      vesselSubtype: 'power-center-console',
    })

    expect(
      routeQueryToBoatInventoryFilters({
        vesselMode: 'sail',
        vesselSubtype: 'power-center-console',
      }),
    ).toMatchObject({
      vesselMode: 'sail',
      vesselSubtype: '',
    })
  })
})

describe('boatInventoryFilterQuerySignature', () => {
  it('stays stable when only sort or page changes in the route', () => {
    const baseFilters = routeQueryToBoatInventoryFilters({ make: 'Boston Whaler' })
    const sortAndPageFilters = routeQueryToBoatInventoryFilters({
      make: 'Boston Whaler',
      sort: 'price-asc',
      page: '3',
    })

    expect(boatInventoryFilterQuerySignature(sortAndPageFilters)).toBe(
      boatInventoryFilterQuerySignature(baseFilters),
    )
  })
})

describe('buildBoatInventoryNavigationQuery', () => {
  it('carries the current filters plus non-default sort', () => {
    const filters = createEmptyBoatInventoryFilters()
    filters.make = 'Boston Whaler'
    filters.q = 'diesel'

    expect(
      buildBoatInventoryNavigationQuery({
        filters,
        sort: 'price-asc',
        page: 1,
      }),
    ).toEqual({
      make: 'Boston Whaler',
      q: 'diesel',
      sort: 'price-asc',
    })
  })

  it('serializes vessel mode and subtype into the navigation query', () => {
    const filters = createEmptyBoatInventoryFilters()
    filters.vesselMode = 'power'
    filters.vesselSubtype = 'power-sportfish'

    expect(
      buildBoatInventoryNavigationQuery({
        filters,
      }),
    ).toEqual({
      vesselMode: 'power',
      vesselSubtype: 'power-sportfish',
    })
  })

  it('serializes the tightened budget and length presets into navigation query values', () => {
    const filters = createEmptyBoatInventoryFilters()
    const budgetPreset = BOAT_INVENTORY_BUDGET_PRESETS[4]
    const lengthPreset = BOAT_INVENTORY_LENGTH_PRESETS[2]

    filters.minPrice = budgetPreset.minPrice
    filters.maxPrice = budgetPreset.maxPrice
    filters.minLength = lengthPreset.minLength
    filters.maxLength = lengthPreset.maxLength

    expect(
      buildBoatInventoryNavigationQuery({
        filters,
      }),
    ).toEqual({
      minPrice: '500000',
      maxPrice: '1000000',
      minLength: '30',
      maxLength: '36',
    })
  })

  it('omits the page number when the target page is the first page', () => {
    expect(
      buildBoatInventoryNavigationQuery({
        filters: createEmptyBoatInventoryFilters(),
        page: 1,
      }),
    ).toEqual({})
  })
})

describe('clearBoatInventoryFilter', () => {
  it('clears subtype when vessel mode is removed', () => {
    const filters = createEmptyBoatInventoryFilters()
    filters.vesselMode = 'power'
    filters.vesselSubtype = 'power-center-console'
    filters.make = 'Regulator'

    expect(clearBoatInventoryFilter(filters, 'vesselMode')).toEqual({
      ...filters,
      vesselMode: '',
      vesselSubtype: '',
    })
  })

  it('keeps other filters intact when clearing one field', () => {
    const filters = createEmptyBoatInventoryFilters()
    filters.maxPrice = BOAT_INVENTORY_BUDGET_PRESETS[0].maxPrice
    filters.maxLength = BOAT_INVENTORY_LENGTH_PRESETS[0].maxLength
    filters.location = 'FL'

    expect(clearBoatInventoryFilter(filters, 'location')).toEqual({
      ...filters,
      location: '',
    })
  })
})
