import { describe, expect, it } from 'vitest'
import {
  boatInventoryFilterQuerySignature,
  buildBoatInventoryNavigationQuery,
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

  it('omits the page number when the target page is the first page', () => {
    expect(
      buildBoatInventoryNavigationQuery({
        filters: createEmptyBoatInventoryFilters(),
        page: 1,
      }),
    ).toEqual({})
  })
})
