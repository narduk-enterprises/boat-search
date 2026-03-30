import { describe, expect, it } from 'vitest'
import {
  normalizeBoatGeo,
  resolveAppleGeocodeMatch,
  type AppleGeocodeCandidate,
} from '../../lib/boatGeo'

describe('normalizeBoatGeo', () => {
  it('keeps the suffix after dealer-prefixed city strings', () => {
    const result = normalizeBoatGeo({
      city: 'MarineMax Sarasota | Sarasota',
      state: 'Florida',
      country: 'US',
    })

    expect(result.normalizedCity).toBe('Sarasota')
    expect(result.normalizedState).toBe('Florida')
    expect(result.geoStatus).toBe('pending')
    expect(result.issues).toContain('city_pipe_suffix_used')
  })

  it('reparses raw location when city starts with a length prefix', () => {
    const result = normalizeBoatGeo({
      location: '25ftWest Palm Beach, FloridaUS39,000 Own this boat for 026/month',
      city: '25ftWest Palm Beach',
      state: '',
      country: 'US',
    })

    expect(result.normalizedCity).toBe('West Palm Beach')
    expect(result.normalizedState).toBe('Florida')
    expect(result.geoStatus).toBe('pending')
    expect(result.issues).toContain('city_length_prefixed')
    expect(result.issues).toContain('location_reparsed')
  })

  it('treats state values that are actually countries as invalid', () => {
    const result = normalizeBoatGeo({
      city: 'Destin',
      state: 'United States',
      country: null,
    })

    expect(result.normalizedState).toBeNull()
    expect(result.normalizedCountry).toBe('US')
    expect(result.geoStatus).toBe('skipped')
    expect(result.geoError).toBe('missing_state')
    expect(result.issues).toContain('state_was_country')
  })

  it('skips rows without a confident city and state', () => {
    const result = normalizeBoatGeo({
      location: null,
      city: null,
      state: null,
      country: null,
    })

    expect(result.geoStatus).toBe('skipped')
    expect(result.geoError).toBe('missing_city_state')
  })

  it('keeps already clean city/state/country inputs intact', () => {
    const result = normalizeBoatGeo({
      location: 'Orange Beach, Alabama, US',
      city: 'Orange Beach',
      state: 'Alabama',
      country: 'US',
    })

    expect(result.normalizedLocation).toBe('Orange Beach, Alabama, US')
    expect(result.geoQuery).toBe('Orange Beach, Alabama, US')
    expect(result.geoStatus).toBe('pending')
    expect(result.issues).toEqual([])
  })
})

describe('resolveAppleGeocodeMatch', () => {
  const normalized = {
    normalizedCity: 'Miami',
    normalizedState: 'Florida',
    normalizedCountry: 'US',
  }

  const strongCandidate: AppleGeocodeCandidate = {
    coordinate: {
      latitude: 25.7617,
      longitude: -80.1918,
    },
    structuredAddress: {
      locality: 'Miami',
      administrativeArea: 'Florida',
      administrativeAreaCode: 'FL',
    },
    countryCode: 'US',
  }

  it('matches a single strong result', () => {
    const result = resolveAppleGeocodeMatch(normalized, [strongCandidate])

    expect(result.geoStatus).toBe('matched')
    expect(result.geoLat).toBe(25.7617)
    expect(result.geoLng).toBe(-80.1918)
    expect(result.geoError).toBeNull()
  })

  it('marks multiple plausible results as ambiguous', () => {
    const result = resolveAppleGeocodeMatch(normalized, [
      strongCandidate,
      {
        ...strongCandidate,
        coordinate: { latitude: 25.7, longitude: -80.2 },
      },
    ])

    expect(result.geoStatus).toBe('ambiguous')
    expect(result.geoError).toBe('multiple_plausible_results')
  })

  it('marks empty responses as failed', () => {
    const result = resolveAppleGeocodeMatch(normalized, [])

    expect(result.geoStatus).toBe('failed')
    expect(result.geoError).toBe('no_results')
  })

  it('fails when the provider result does not strongly match the normalized city/state', () => {
    const result = resolveAppleGeocodeMatch(normalized, [
      {
        coordinate: {
          latitude: 30.0,
          longitude: -81.0,
        },
        structuredAddress: {
          locality: 'Jacksonville',
          administrativeArea: 'Florida',
          administrativeAreaCode: 'FL',
        },
        countryCode: 'US',
      },
    ])

    expect(result.geoStatus).toBe('failed')
    expect(result.geoError).toBe('no_strong_match')
  })
})
