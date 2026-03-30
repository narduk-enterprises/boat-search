import { describe, expect, it, vi } from 'vitest'
import {
  BOAT_GEO_NORMALIZATION_VERSION,
  BOAT_GEO_PRECISION,
  BOAT_GEO_PROVIDER,
} from '../../lib/boatGeo'
import { resolveBoatGeoWriteFields, shouldRefreshBoatGeo } from '../../server/utils/boatGeo'

function createCacheAdapter(
  initial = new Map<
    string,
    { status: string; lat: number | null; lng: number | null; error: string | null }
  >(),
) {
  return {
    cache: initial,
    adapter: {
      async get(query: string) {
        return initial.get(query) ?? null
      },
      async set(
        query: string,
        _now: string,
        result: { status: string; lat: number | null; lng: number | null; error: string | null },
      ) {
        initial.set(query, result)
      },
    },
  }
}

describe('shouldRefreshBoatGeo', () => {
  it('returns false when raw location fields and version are unchanged', () => {
    expect(
      shouldRefreshBoatGeo(
        {
          location: 'Miami, Florida',
          city: 'Miami',
          state: 'Florida',
          country: 'US',
          normalizedLocation: 'Miami, Florida, US',
          normalizedCity: 'Miami',
          normalizedState: 'Florida',
          normalizedCountry: 'US',
          geoLat: 25.7617,
          geoLng: -80.1918,
          geoPrecision: 'city',
          geoProvider: 'apple',
          geoStatus: 'matched',
          geoQuery: 'Miami, Florida, US',
          geoError: null,
          geoUpdatedAt: '2026-03-30T00:00:00.000Z',
          geoNormalizationVersion: BOAT_GEO_NORMALIZATION_VERSION,
        },
        {
          location: ' Miami, Florida ',
          city: 'Miami',
          state: 'Florida',
          country: 'US',
        },
      ),
    ).toBe(false)
  })

  it('returns true when the normalization version is stale', () => {
    expect(
      shouldRefreshBoatGeo(
        {
          location: 'Miami, Florida',
          city: 'Miami',
          state: 'Florida',
          country: 'US',
          normalizedLocation: 'Miami, Florida, US',
          normalizedCity: 'Miami',
          normalizedState: 'Florida',
          normalizedCountry: 'US',
          geoLat: 25.7617,
          geoLng: -80.1918,
          geoPrecision: 'city',
          geoProvider: 'apple',
          geoStatus: 'matched',
          geoQuery: 'Miami, Florida, US',
          geoError: null,
          geoUpdatedAt: '2026-03-30T00:00:00.000Z',
          geoNormalizationVersion: 0,
        },
        {
          location: 'Miami, Florida',
          city: 'Miami',
          state: 'Florida',
          country: 'US',
        },
      ),
    ).toBe(true)
  })
})

describe('resolveBoatGeoWriteFields', () => {
  it('uses a cached geocode match without calling the provider again', async () => {
    const geocode = vi.fn()
    const { adapter } = createCacheAdapter(
      new Map([
        [
          'Miami, Florida, US',
          {
            status: 'matched',
            lat: 25.7617,
            lng: -80.1918,
            error: null,
          },
        ],
      ]),
    )

    const result = await resolveBoatGeoWriteFields(
      null as never,
      {
        location: 'Miami, Florida',
        city: 'Miami',
        state: 'Florida',
        country: 'US',
      },
      {
        cache: adapter,
        geocode,
        now: '2026-03-30T00:00:00.000Z',
      },
    )

    expect(result).toMatchObject({
      normalizedCity: 'Miami',
      normalizedState: 'Florida',
      normalizedCountry: 'US',
      geoStatus: 'matched',
      geoLat: 25.7617,
      geoLng: -80.1918,
      geoPrecision: BOAT_GEO_PRECISION,
      geoProvider: BOAT_GEO_PROVIDER,
    })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('writes a skipped result when normalization cannot derive city/state', async () => {
    const geocode = vi.fn()
    const { adapter } = createCacheAdapter()

    const result = await resolveBoatGeoWriteFields(
      null as never,
      {
        location: null,
        city: null,
        state: null,
        country: null,
      },
      {
        cache: adapter,
        geocode,
        now: '2026-03-30T00:00:00.000Z',
      },
    )

    expect(result).toMatchObject({
      geoStatus: 'skipped',
      geoError: 'missing_city_state',
      geoLat: null,
      geoLng: null,
    })
    expect(geocode).not.toHaveBeenCalled()
  })

  it('stores provider failures as failed geocode rows', async () => {
    const geocode = vi.fn().mockRejectedValue(new Error('provider down'))
    const { adapter, cache } = createCacheAdapter()

    const result = await resolveBoatGeoWriteFields(
      null as never,
      {
        location: 'Miami, Florida',
        city: 'Miami',
        state: 'Florida',
        country: 'US',
      },
      {
        cache: adapter,
        geocode,
        now: '2026-03-30T00:00:00.000Z',
      },
    )

    expect(result).toMatchObject({
      geoStatus: 'failed',
      geoError: 'provider down',
      geoLat: null,
      geoLng: null,
    })
    expect(cache.get('Miami, Florida, US')).toMatchObject({
      status: 'failed',
      error: 'provider down',
    })
  })
})
