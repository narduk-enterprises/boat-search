import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { BoatDedupeInput, BoatDedupeRecord, BoatEntityDraft } from '~~/lib/boatDedupe'
import {
  deriveBoatDedupeState,
  findMatchingSourceListing,
  normalizeBoatUrl,
} from '~~/lib/boatDedupe'
import type * as schema from '~~/server/database/schema'
import { boatDedupeCandidates, boatEntities, boats } from '~~/server/database/schema'
import { resolveBoatGeoWriteFields } from '#server/utils/boatGeo'
import { useAppDatabase } from '#server/utils/database'

type AppDb = DrizzleD1Database<typeof schema>

const BOAT_DEDUPE_SELECT = {
  id: boats.id,
  source: boats.source,
  url: boats.url,
  listingId: boats.listingId,
  make: boats.make,
  model: boats.model,
  year: boats.year,
  length: boats.length,
  price: boats.price,
  location: boats.location,
  city: boats.city,
  state: boats.state,
  country: boats.country,
  normalizedLocation: boats.normalizedLocation,
  normalizedCity: boats.normalizedCity,
  normalizedState: boats.normalizedState,
  normalizedCountry: boats.normalizedCountry,
  geoLat: boats.geoLat,
  geoLng: boats.geoLng,
  geoPrecision: boats.geoPrecision,
  geoProvider: boats.geoProvider,
  geoStatus: boats.geoStatus,
  geoQuery: boats.geoQuery,
  geoError: boats.geoError,
  geoUpdatedAt: boats.geoUpdatedAt,
  geoNormalizationVersion: boats.geoNormalizationVersion,
  contactInfo: boats.contactInfo,
  contactName: boats.contactName,
  contactPhone: boats.contactPhone,
  description: boats.description,
  fullText: boats.fullText,
  images: boats.images,
  updatedAt: boats.updatedAt,
}

type BoatDedupeSelectRow = {
  id: number
  source: string
  url: string
  listingId: string | null
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
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
  contactInfo: string | null
  contactName: string | null
  contactPhone: string | null
  description: string | null
  fullText: string | null
  images: string | null
  updatedAt: string
}

function parseImages(imagesJson: string | null) {
  if (!imagesJson) return []

  try {
    const parsed = JSON.parse(imagesJson) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function toDedupeRecord(row: BoatDedupeSelectRow | typeof boats.$inferSelect): BoatDedupeRecord {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    listingId: row.listingId,
    make: row.make,
    model: row.model,
    year: row.year,
    length: row.length,
    price: row.price,
    location: row.location,
    city: row.city,
    state: row.state,
    country: row.country,
    contactInfo: row.contactInfo,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    description: row.description,
    fullText: row.fullText,
    images: parseImages(row.images),
    updatedAt: row.updatedAt,
  }
}

async function selectActiveListingsForIdentity(db: AppDb, candidate: BoatDedupeInput) {
  const conditions: SQL[] = []

  if (candidate.listingId) {
    conditions.push(
      and(eq(boats.source, candidate.source), eq(boats.listingId, candidate.listingId))!,
    )
  }
  conditions.push(eq(boats.url, candidate.url))

  return await db
    .select(BOAT_DEDUPE_SELECT)
    .from(boats)
    .where(and(or(...conditions)!, isNull(boats.supersededByBoatId)))
    .all()
}

export async function upsertBoatSourceListing(
  event: H3Event,
  values: typeof boats.$inferInsert,
): Promise<{ boatId: number; inserted: number; updated: number }> {
  const db = useAppDatabase(event)
  const identityCandidates = await selectActiveListingsForIdentity(db, {
    source: values.source ?? 'boats.com',
    url: values.url,
    listingId: values.listingId ?? null,
    make: values.make ?? null,
    model: values.model ?? null,
    year: values.year ?? null,
    length: values.length ?? null,
    price: values.price ?? null,
    location: values.location ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    country: values.country ?? null,
    contactInfo: values.contactInfo ?? null,
    contactName: values.contactName ?? null,
    contactPhone: values.contactPhone ?? null,
    description: values.description ?? null,
    fullText: values.fullText ?? null,
    images: parseImages(values.images ?? null),
  })

  const match = findMatchingSourceListing(
    identityCandidates.map((record) => toDedupeRecord(record)),
    {
      source: values.source ?? 'boats.com',
      url: values.url,
      listingId: values.listingId ?? null,
      make: values.make ?? null,
      model: values.model ?? null,
      year: values.year ?? null,
      length: values.length ?? null,
      price: values.price ?? null,
      location: values.location ?? null,
      city: values.city ?? null,
      state: values.state ?? null,
      country: values.country ?? null,
      contactInfo: values.contactInfo ?? null,
      contactName: values.contactName ?? null,
      contactPhone: values.contactPhone ?? null,
      description: values.description ?? null,
      fullText: values.fullText ?? null,
      images: parseImages(values.images ?? null),
    },
  )

  if (match) {
    const matchedRow = identityCandidates.find((candidate) => candidate.id === match.id) ?? null
    const nextGeoFields = await resolveBoatGeoWriteFields(db, values, {
      existing: matchedRow,
      now: values.updatedAt ?? new Date().toISOString(),
    })

    await db
      .update(boats)
      .set({
        ...values,
        ...(nextGeoFields ?? {}),
        supersededByBoatId: null,
      })
      .where(eq(boats.id, match.id))
      .run()

    return { boatId: match.id, inserted: 0, updated: 1 }
  }

  const nextGeoFields = await resolveBoatGeoWriteFields(db, values, {
    existing: null,
    now: values.updatedAt ?? new Date().toISOString(),
  })

  await db
    .insert(boats)
    .values({
      ...values,
      ...(nextGeoFields ?? {}),
      entityId: null,
      supersededByBoatId: null,
      dedupeMethod: null,
      dedupeConfidence: null,
    })
    .run()

  const inserted = await selectActiveListingsForIdentity(db, {
    source: values.source ?? 'boats.com',
    url: values.url,
    listingId: values.listingId ?? null,
    make: values.make ?? null,
    model: values.model ?? null,
    year: values.year ?? null,
    length: values.length ?? null,
    price: values.price ?? null,
    location: values.location ?? null,
    city: values.city ?? null,
    state: values.state ?? null,
    country: values.country ?? null,
    contactInfo: values.contactInfo ?? null,
    contactName: values.contactName ?? null,
    contactPhone: values.contactPhone ?? null,
    description: values.description ?? null,
    fullText: values.fullText ?? null,
    images: parseImages(values.images ?? null),
  })

  const created = findMatchingSourceListing(
    inserted.map((record) => toDedupeRecord(record)),
    {
      source: values.source ?? 'boats.com',
      url: values.url,
      listingId: values.listingId ?? null,
      make: values.make ?? null,
      model: values.model ?? null,
      year: values.year ?? null,
      length: values.length ?? null,
      price: values.price ?? null,
      location: values.location ?? null,
      city: values.city ?? null,
      state: values.state ?? null,
      country: values.country ?? null,
      contactInfo: values.contactInfo ?? null,
      contactName: values.contactName ?? null,
      contactPhone: values.contactPhone ?? null,
      description: values.description ?? null,
      fullText: values.fullText ?? null,
      images: parseImages(values.images ?? null),
    },
  )

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not reload the inserted source listing.',
    })
  }

  return { boatId: created.id, inserted: 1, updated: 0 }
}

export async function listActiveBoatSourceListingIdentities(event: H3Event, source: string) {
  const db = useAppDatabase(event)
  const rows = await db
    .select({
      listingId: boats.listingId,
      url: boats.url,
    })
    .from(boats)
    .where(and(eq(boats.source, source), isNull(boats.supersededByBoatId)))
    .all()

  const listingIds = new Set<string>()
  const normalizedUrls = new Set<string>()

  for (const row of rows) {
    const listingId = row.listingId?.trim()
    if (listingId) {
      listingIds.add(listingId)
    }

    const normalizedUrl = normalizeBoatUrl(row.url)
    if (normalizedUrl) {
      normalizedUrls.add(normalizedUrl)
    }
  }

  return {
    listingIds: [...listingIds],
    normalizedUrls: [...normalizedUrls],
  }
}

function buildWeakSourceListingCondition() {
  return and(
    or(
      isNull(boats.images),
      sql`trim(${boats.images}) = ''`,
      sql`trim(${boats.images}) = '[]'`,
      sql`(json_valid(${boats.images}) AND json_array_length(${boats.images}) <= 1)`,
    )!,
    isNull(boats.contactInfo),
    isNull(boats.otherDetails),
    isNull(boats.features),
    isNull(boats.propulsion),
    isNull(boats.specifications),
  )!
}

export async function listRefreshableBoatSourceListingIdentities(event: H3Event, source: string) {
  const db = useAppDatabase(event)
  const rows = await db
    .select({
      listingId: boats.listingId,
      url: boats.url,
    })
    .from(boats)
    .where(
      and(
        eq(boats.source, source),
        isNull(boats.supersededByBoatId),
        buildWeakSourceListingCondition(),
      ),
    )
    .all()

  const listingIds = new Set<string>()
  const normalizedUrls = new Set<string>()

  for (const row of rows) {
    const listingId = row.listingId?.trim()
    if (listingId) {
      listingIds.add(listingId)
    }

    const normalizedUrl = normalizeBoatUrl(row.url)
    if (normalizedUrl) {
      normalizedUrls.add(normalizedUrl)
    }
  }

  return {
    listingIds: [...listingIds],
    normalizedUrls: [...normalizedUrls],
  }
}

async function insertBoatEntities(db: AppDb, entities: BoatEntityDraft[]) {
  if (!entities.length) return new Map<number, number>()

  const now = new Date().toISOString()
  for (const entity of entities) {
    await db
      .insert(boatEntities)
      .values({
        representativeBoatId: entity.representativeBoatId,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  const representativeBoatIds = entities.map((entity) => entity.representativeBoatId)
  const rows = await db
    .select({
      id: boatEntities.id,
      representativeBoatId: boatEntities.representativeBoatId,
    })
    .from(boatEntities)
    .where(inArray(boatEntities.representativeBoatId, representativeBoatIds))
    .all()

  return new Map(rows.map((row) => [row.representativeBoatId ?? 0, row.id]))
}

export async function rebuildBoatDedupeStateWithDb(db: AppDb) {
  const rows = await db.select().from(boats).orderBy(boats.id).all()
  const result = deriveBoatDedupeState(rows.map((row) => toDedupeRecord(row)))

  await db.delete(boatDedupeCandidates).run()
  await db.delete(boatEntities).run()
  await db
    .update(boats)
    .set({
      entityId: null,
      supersededByBoatId: null,
      dedupeMethod: null,
      dedupeConfidence: null,
    })
    .run()

  const entityIdByRepresentativeBoatId = await insertBoatEntities(db, result.entities)

  for (const assignment of result.assignments) {
    await db
      .update(boats)
      .set({
        entityId:
          assignment.entityKey != null
            ? (entityIdByRepresentativeBoatId.get(assignment.entityKey) ?? null)
            : null,
        supersededByBoatId: assignment.supersededByBoatId,
        dedupeMethod: assignment.dedupeMethod,
        dedupeConfidence: assignment.dedupeConfidence,
      })
      .where(eq(boats.id, assignment.boatId))
      .run()
  }

  const now = new Date().toISOString()
  for (const candidate of result.candidates) {
    await db
      .insert(boatDedupeCandidates)
      .values({
        leftBoatId: candidate.leftBoatId,
        rightBoatId: candidate.rightBoatId,
        confidenceScore: candidate.confidenceScore,
        ruleHitsJson: JSON.stringify(candidate.ruleHits),
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }

  return result
}

export async function rebuildBoatDedupeState(event: H3Event) {
  return await rebuildBoatDedupeStateWithDb(useAppDatabase(event))
}
