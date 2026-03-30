export const BOAT_GEO_NORMALIZATION_VERSION = 1
export const BOAT_GEO_PRECISION = 'city'
export const BOAT_GEO_PROVIDER = 'apple'

export const BOAT_GEO_STATUSES = ['pending', 'matched', 'ambiguous', 'skipped', 'failed'] as const

export type BoatGeoStatus = (typeof BOAT_GEO_STATUSES)[number]

export interface BoatGeoInput {
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export interface BoatGeoNormalizationResult {
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoQuery: string | null
  geoStatus: BoatGeoStatus
  geoError: string | null
  issues: string[]
}

export interface AppleGeocodeCandidate {
  coordinate?: {
    latitude?: number | string
    longitude?: number | string
  }
  structuredAddress?: {
    locality?: string
    subLocality?: string
    administrativeArea?: string
    administrativeAreaCode?: string
  }
  country?: string
  countryCode?: string
}

export interface BoatGeoResolvedMatch {
  geoStatus: Extract<BoatGeoStatus, 'matched' | 'ambiguous' | 'failed'>
  geoError: string | null
  geoLat: number | null
  geoLng: number | null
}

const COUNTRY_EQUIVALENTS = new Map<string, string>([
  ['us', 'US'],
  ['usa', 'US'],
  ['u s', 'US'],
  ['unitedstates', 'US'],
  ['united states', 'US'],
])

const US_STATES = [
  ['Alabama', 'AL'],
  ['Alaska', 'AK'],
  ['Arizona', 'AZ'],
  ['Arkansas', 'AR'],
  ['California', 'CA'],
  ['Colorado', 'CO'],
  ['Connecticut', 'CT'],
  ['Delaware', 'DE'],
  ['District of Columbia', 'DC'],
  ['Florida', 'FL'],
  ['Georgia', 'GA'],
  ['Hawaii', 'HI'],
  ['Idaho', 'ID'],
  ['Illinois', 'IL'],
  ['Indiana', 'IN'],
  ['Iowa', 'IA'],
  ['Kansas', 'KS'],
  ['Kentucky', 'KY'],
  ['Louisiana', 'LA'],
  ['Maine', 'ME'],
  ['Maryland', 'MD'],
  ['Massachusetts', 'MA'],
  ['Michigan', 'MI'],
  ['Minnesota', 'MN'],
  ['Mississippi', 'MS'],
  ['Missouri', 'MO'],
  ['Montana', 'MT'],
  ['Nebraska', 'NE'],
  ['Nevada', 'NV'],
  ['New Hampshire', 'NH'],
  ['New Jersey', 'NJ'],
  ['New Mexico', 'NM'],
  ['New York', 'NY'],
  ['North Carolina', 'NC'],
  ['North Dakota', 'ND'],
  ['Ohio', 'OH'],
  ['Oklahoma', 'OK'],
  ['Oregon', 'OR'],
  ['Pennsylvania', 'PA'],
  ['Puerto Rico', 'PR'],
  ['Rhode Island', 'RI'],
  ['South Carolina', 'SC'],
  ['South Dakota', 'SD'],
  ['Tennessee', 'TN'],
  ['Texas', 'TX'],
  ['Utah', 'UT'],
  ['Vermont', 'VT'],
  ['Virginia', 'VA'],
  ['Washington', 'WA'],
  ['West Virginia', 'WV'],
  ['Wisconsin', 'WI'],
  ['Wyoming', 'WY'],
] as const

const US_STATE_CODES = new Map<string, string>(
  US_STATES.flatMap(([name, code]) => [
    [normalizeToken(name), code],
    [normalizeToken(code), code],
  ]),
)

const US_STATE_NAMES = [...US_STATES].sort((left, right) => right[0].length - left[0].length)

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

export function trimBoatGeoValue(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const normalized = normalizeWhitespace(value)
  return normalized.length > 0 ? normalized : null
}

function normalizeCountry(country: string | null) {
  if (!country) return 'US'
  const normalized = normalizeToken(country)
  return COUNTRY_EQUIVALENTS.get(normalized) ?? country
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
}

function looksLikeLengthPrefixedCity(city: string | null) {
  if (!city) return false
  return /^\d+(?:\.\d+)?\s*ft/i.test(city)
}

function stripLeadingLengthToken(value: string) {
  return normalizeWhitespace(value.replace(/^\d+(?:\.\d+)?\s*ft\s*/i, ''))
}

function stripDealerPrefix(city: string | null) {
  if (!city?.includes('|')) return city
  return trimBoatGeoValue(city.split('|').at(-1) ?? city)
}

function joinLocationParts(parts: Array<string | null | undefined>) {
  const filtered = parts.filter((part): part is string => Boolean(trimBoatGeoValue(part)))
  return filtered.length > 0 ? filtered.join(', ') : null
}

function consumeUsStatePrefix(value: string) {
  for (const [stateName] of US_STATE_NAMES) {
    const pattern = new RegExp(
      `^${escapeRegex(stateName)}(?=$|,|\\s|\\d|US|USA|United States)`,
      'i',
    )
    const match = value.match(pattern)
    if (match?.[0]) {
      return {
        state: stateName,
        remainder: normalizeWhitespace(value.slice(match[0].length)),
      }
    }
  }
  return null
}

function parseFallbackState(value: string) {
  if (!value) return null

  const untilComma = value.indexOf(',')
  if (untilComma >= 0) {
    const state = trimBoatGeoValue(value.slice(0, untilComma))
    const remainder = normalizeWhitespace(value.slice(untilComma + 1))
    return state ? { state, remainder } : null
  }

  const match = value.match(/^([A-Za-z .'-]+?)(?=(?:US|USA|United States)\b|\d|$)/)
  if (!match?.[1]) return null

  const state = trimBoatGeoValue(match[1])
  if (!state) return null

  return {
    state,
    remainder: normalizeWhitespace(value.slice(match[0].length)),
  }
}

function extractCountryPrefix(value: string | null) {
  const normalized = trimBoatGeoValue(value)
  if (!normalized) return null

  const countryPrefix = normalized.match(/^(United States|USA|US)\b/i)
  if (countryPrefix?.[0]) {
    return {
      country: 'US',
      remainder: normalizeWhitespace(normalized.slice(countryPrefix[0].length)),
    }
  }

  const nextComma = normalized.indexOf(',')
  if (nextComma >= 0) {
    return {
      country: trimBoatGeoValue(normalized.slice(0, nextComma)),
      remainder: normalizeWhitespace(normalized.slice(nextComma + 1)),
    }
  }

  return {
    country: trimBoatGeoValue(normalized),
    remainder: '',
  }
}

function parseLocationFromRaw(location: string | null) {
  if (!location) return null

  const cleaned = stripLeadingLengthToken(location)
  const commaIndex = cleaned.indexOf(',')
  if (commaIndex < 0) return null

  const city = trimBoatGeoValue(cleaned.slice(0, commaIndex))
  const remainder = normalizeWhitespace(cleaned.slice(commaIndex + 1))
  if (!city || !remainder) return null

  const matchedState = consumeUsStatePrefix(remainder) ?? parseFallbackState(remainder)
  if (!matchedState?.state) {
    return {
      city,
      state: null,
      country: null,
    }
  }

  const matchedCountry = extractCountryPrefix(matchedState.remainder)
  return {
    city,
    state: matchedState.state,
    country: matchedCountry?.country ?? null,
  }
}

function escapeRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function normalizeBoatGeo(input: BoatGeoInput): BoatGeoNormalizationResult {
  const issues: string[] = []
  const location = trimBoatGeoValue(input.location)
  let city = trimBoatGeoValue(input.city)
  let state = trimBoatGeoValue(input.state)
  let country = normalizeCountry(trimBoatGeoValue(input.country))

  const strippedCity = stripDealerPrefix(city)
  if (strippedCity !== city) {
    city = strippedCity
    issues.push('city_pipe_suffix_used')
  }

  if (state === 'United States') {
    state = null
    country = 'US'
    issues.push('state_was_country')
  }

  const shouldReparseLocation = looksLikeLengthPrefixedCity(city) || !city || !state

  if (looksLikeLengthPrefixedCity(city)) {
    city = null
    issues.push('city_length_prefixed')
  }

  if (shouldReparseLocation && location) {
    const reparsed = parseLocationFromRaw(location)
    if (reparsed?.city && reparsed.city !== city) {
      city = reparsed.city
      issues.push('location_reparsed')
    }
    if (reparsed?.state && reparsed.state !== state) {
      state = reparsed.state
      if (!issues.includes('location_reparsed')) issues.push('location_reparsed')
    }
    if (reparsed?.country) {
      country = normalizeCountry(reparsed.country)
    }
  }

  const normalizedCountry = normalizeCountry(country)
  const normalizedCity = trimBoatGeoValue(city)
  const normalizedState = trimBoatGeoValue(state)
  const normalizedLocation = joinLocationParts([normalizedCity, normalizedState, normalizedCountry])

  if (!normalizedCity || !normalizedState) {
    const missingParts = [
      !normalizedCity ? 'city' : null,
      !normalizedState ? 'state' : null,
    ].filter(Boolean)

    return {
      normalizedLocation,
      normalizedCity,
      normalizedState,
      normalizedCountry,
      geoQuery: null,
      geoStatus: 'skipped',
      geoError: `missing_${missingParts.join('_')}`,
      issues,
    }
  }

  return {
    normalizedLocation,
    normalizedCity,
    normalizedState,
    normalizedCountry,
    geoQuery: `${normalizedCity}, ${normalizedState}, ${normalizedCountry}`,
    geoStatus: 'pending',
    geoError: null,
    issues,
  }
}

function normalizeStateCode(state: string | null | undefined) {
  const normalized = normalizeToken(state)
  return US_STATE_CODES.get(normalized) ?? normalized
}

function parseCoordinate(value: number | string | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function matchesGeocodeCandidate(
  result: AppleGeocodeCandidate,
  normalized: Pick<
    BoatGeoNormalizationResult,
    'normalizedCity' | 'normalizedState' | 'normalizedCountry'
  >,
) {
  const cityToken = normalizeToken(normalized.normalizedCity)
  const stateCode = normalizeStateCode(normalized.normalizedState)
  const countryToken = normalizeToken(normalized.normalizedCountry)

  const localityToken = normalizeToken(result.structuredAddress?.locality)
  const subLocalityToken = normalizeToken(result.structuredAddress?.subLocality)
  if (cityToken && localityToken !== cityToken && subLocalityToken !== cityToken) return false

  const administrativeAreaCode = normalizeStateCode(
    result.structuredAddress?.administrativeAreaCode,
  )
  const administrativeAreaName = normalizeStateCode(result.structuredAddress?.administrativeArea)
  if (stateCode && administrativeAreaCode !== stateCode && administrativeAreaName !== stateCode) {
    return false
  }

  const resultCountry = normalizeToken(result.countryCode || result.country)
  return !countryToken || !resultCountry || resultCountry === countryToken
}

export function resolveAppleGeocodeMatch(
  normalized: Pick<
    BoatGeoNormalizationResult,
    'normalizedCity' | 'normalizedState' | 'normalizedCountry'
  >,
  results: AppleGeocodeCandidate[],
): BoatGeoResolvedMatch {
  const plausible = results.filter((result) => matchesGeocodeCandidate(result, normalized))

  if (plausible.length !== 1) {
    if (plausible.length > 1) {
      return {
        geoStatus: 'ambiguous',
        geoError: 'multiple_plausible_results',
        geoLat: null,
        geoLng: null,
      }
    }

    if (results.length === 0) {
      return {
        geoStatus: 'failed',
        geoError: 'no_results',
        geoLat: null,
        geoLng: null,
      }
    }

    return {
      geoStatus: 'failed',
      geoError: 'no_strong_match',
      geoLat: null,
      geoLng: null,
    }
  }

  const candidate = plausible[0]
  const geoLat = parseCoordinate(candidate?.coordinate?.latitude)
  const geoLng = parseCoordinate(candidate?.coordinate?.longitude)

  if (geoLat == null || geoLng == null) {
    return {
      geoStatus: 'failed',
      geoError: 'missing_coordinates',
      geoLat: null,
      geoLng: null,
    }
  }

  return {
    geoStatus: 'matched',
    geoError: null,
    geoLat,
    geoLng,
  }
}

export function boatGeoFieldsEqual(
  left: Pick<BoatGeoInput, 'location' | 'city' | 'state' | 'country'>,
  right: Pick<BoatGeoInput, 'location' | 'city' | 'state' | 'country'>,
) {
  return (
    trimBoatGeoValue(left.location) === trimBoatGeoValue(right.location) &&
    trimBoatGeoValue(left.city) === trimBoatGeoValue(right.city) &&
    trimBoatGeoValue(left.state) === trimBoatGeoValue(right.state) &&
    trimBoatGeoValue(left.country) === trimBoatGeoValue(right.country)
  )
}

export function formatNormalizedBoatLocation(input: {
  normalizedCity?: string | null
  normalizedState?: string | null
  normalizedCountry?: string | null
  city?: string | null
  state?: string | null
  location?: string | null
}) {
  const city = trimBoatGeoValue(input.normalizedCity) ?? trimBoatGeoValue(input.city)
  const state = trimBoatGeoValue(input.normalizedState) ?? trimBoatGeoValue(input.state)
  const country = trimBoatGeoValue(input.normalizedCountry)

  const cityState = joinLocationParts([city, state])
  if (country && country !== 'US') {
    return (
      joinLocationParts([city, state, country]) ??
      trimBoatGeoValue(input.location) ??
      'Location unlisted'
    )
  }
  if (cityState) return cityState
  return trimBoatGeoValue(input.location) ?? 'Location unlisted'
}
