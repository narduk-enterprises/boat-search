import { eq } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import { geocodeAppleMaps } from '@narduk-enterprises/narduk-nuxt-template-layer-maps/server/utils/appleMapToken'
import { geocodeCache } from '~~/server/database/schema'
import {
  BOAT_GEO_NORMALIZATION_VERSION,
  BOAT_GEO_PRECISION,
  BOAT_GEO_PROVIDER,
  boatGeoFieldsEqual,
  normalizeBoatGeo,
  resolveAppleGeocodeMatch,
  type AppleGeocodeCandidate,
  type BoatGeoInput,
} from '~~/lib/boatGeo'
import type * as schema from '~~/server/database/schema'

type AppDb = DrizzleD1Database<typeof schema>

type ExistingBoatGeo = {
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoLat: number | null
  geoLng: number | null
  geoPrecision: string | null
  geoProvider: string | null
  geoStatus: string | null
  geoQuery: string | null
  geoError: string | null
  geoUpdatedAt: string | null
  geoNormalizationVersion: number | null
}

type BoatGeoWriteFields = Pick<
  (typeof import('~~/server/database/schema'))['boats']['$inferInsert'],
  | 'normalizedLocation'
  | 'normalizedCity'
  | 'normalizedState'
  | 'normalizedCountry'
  | 'geoLat'
  | 'geoLng'
  | 'geoPrecision'
  | 'geoProvider'
  | 'geoStatus'
  | 'geoQuery'
  | 'geoError'
  | 'geoUpdatedAt'
  | 'geoNormalizationVersion'
>

type CachedGeocodeRow = {
  status: string
  lat: number | null
  lng: number | null
  error: string | null
}

type BoatGeoCacheAdapter = {
  get(query: string): Promise<CachedGeocodeRow | null>
  set(
    query: string,
    now: string,
    result: { status: string; lat: number | null; lng: number | null; error: string | null },
  ): Promise<void>
}

function truncateError(message: string | null, maxLength = 240) {
  if (!message) return null
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message
}

function buildBoatGeoWriteFields(
  normalized: ReturnType<typeof normalizeBoatGeo>,
  now: string,
  overrides?: {
    geoStatus?: string
    geoError?: string | null
    geoLat?: number | null
    geoLng?: number | null
  },
): BoatGeoWriteFields {
  return {
    normalizedLocation: normalized.normalizedLocation,
    normalizedCity: normalized.normalizedCity,
    normalizedState: normalized.normalizedState,
    normalizedCountry: normalized.normalizedCountry,
    geoLat: overrides?.geoLat ?? null,
    geoLng: overrides?.geoLng ?? null,
    geoPrecision: BOAT_GEO_PRECISION,
    geoProvider: BOAT_GEO_PROVIDER,
    geoStatus: (overrides?.geoStatus ?? normalized.geoStatus) as BoatGeoWriteFields['geoStatus'],
    geoQuery: normalized.geoQuery,
    geoError: truncateError(overrides?.geoError ?? normalized.geoError),
    geoUpdatedAt: now,
    geoNormalizationVersion: BOAT_GEO_NORMALIZATION_VERSION,
  }
}

async function readCachedGeocode(db: AppDb, query: string) {
  return await db.select().from(geocodeCache).where(eq(geocodeCache.query, query)).limit(1).get()
}

async function writeCachedGeocode(
  db: AppDb,
  query: string,
  now: string,
  result: { status: string; lat: number | null; lng: number | null; error: string | null },
) {
  const existing = await readCachedGeocode(db, query)
  const payload = {
    query,
    provider: BOAT_GEO_PROVIDER,
    precision: BOAT_GEO_PRECISION,
    status: result.status,
    lat: result.lat,
    lng: result.lng,
    error: truncateError(result.error),
    updatedAt: now,
  }

  if (existing) {
    await db.update(geocodeCache).set(payload).where(eq(geocodeCache.query, query)).run()
    return
  }

  await db
    .insert(geocodeCache)
    .values({
      ...payload,
      createdAt: now,
    })
    .run()
}

export function shouldRefreshBoatGeo(existing: ExistingBoatGeo | null, input: BoatGeoInput) {
  if (!existing) return true
  if (existing.geoNormalizationVersion !== BOAT_GEO_NORMALIZATION_VERSION) return true
  if (!existing.geoStatus) return true
  if (existing.geoStatus === 'pending') return true

  return !boatGeoFieldsEqual(existing, input)
}

export async function resolveBoatGeoWriteFields(
  db: AppDb,
  input: BoatGeoInput,
  options: {
    existing?: ExistingBoatGeo | null
    now?: string
    geocode?: typeof geocodeAppleMaps
    cache?: BoatGeoCacheAdapter
  } = {},
): Promise<BoatGeoWriteFields | null> {
  if (!shouldRefreshBoatGeo(options.existing ?? null, input)) {
    return null
  }

  const now = options.now ?? new Date().toISOString()
  const normalized = normalizeBoatGeo(input)
  if (!normalized.geoQuery || normalized.geoStatus === 'skipped') {
    return buildBoatGeoWriteFields(normalized, now)
  }

  const cache = options.cache ?? {
    get: (query: string) => readCachedGeocode(db, query),
    set: (
      query: string,
      nowValue: string,
      result: { status: string; lat: number | null; lng: number | null; error: string | null },
    ) => writeCachedGeocode(db, query, nowValue, result),
  }

  const cached = await cache.get(normalized.geoQuery)
  if (cached) {
    return buildBoatGeoWriteFields(normalized, now, {
      geoStatus: cached.status,
      geoError: cached.error,
      geoLat: cached.lat,
      geoLng: cached.lng,
    })
  }

  const geocode = options.geocode ?? geocodeAppleMaps

  try {
    const response = await geocode(normalized.geoQuery, {
      limitToCountries: normalized.normalizedCountry === 'US' ? 'US' : undefined,
    })
    const resolved = resolveAppleGeocodeMatch(
      normalized,
      (response.results ?? []) as AppleGeocodeCandidate[],
    )

    await cache.set(normalized.geoQuery, now, {
      status: resolved.geoStatus,
      lat: resolved.geoLat,
      lng: resolved.geoLng,
      error: resolved.geoError,
    })

    return buildBoatGeoWriteFields(normalized, now, resolved)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'apple_geocode_failed'

    await cache.set(normalized.geoQuery, now, {
      status: 'failed',
      lat: null,
      lng: null,
      error: message,
    })

    return buildBoatGeoWriteFields(normalized, now, {
      geoStatus: 'failed',
      geoError: message,
      geoLat: null,
      geoLng: null,
    })
  }
}
