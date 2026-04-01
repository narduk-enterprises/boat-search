import { z } from 'zod'
import { boats } from '~~/server/database/schema'
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type {
  BoatInventorySort,
  BoatInventoryVesselMode,
  BoatInventoryVesselSubtype,
} from '~~/app/types/boat-inventory'
import {
  BOAT_INVENTORY_VESSEL_MODE_VALUES,
  BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE,
  BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES,
} from '~~/app/types/boat-inventory'
import type * as schema from '~~/server/database/schema'
import { INVENTORY_BOAT_SELECT } from '#server/utils/boatInventory'

function preprocessOptionalTrimmedString(val: unknown) {
  if (val == null || val === '') return
  if (typeof val !== 'string') return val
  const trimmed = val.trim()
  if (trimmed.length > 0) return trimmed
}

/** Filters shared by /api/boats, saved searches, and cron matching. */
export const boatSearchFilterSchema = z.object({
  make: z.string().optional(),
  location: z.string().optional(),
  minLength: z.coerce.number().optional(),
  maxLength: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  q: z.preprocess(preprocessOptionalTrimmedString, z.string().max(200).optional()),
  vesselMode: z.enum(BOAT_INVENTORY_VESSEL_MODE_VALUES).optional(),
  vesselSubtype: z.enum(BOAT_INVENTORY_VESSEL_SUBTYPE_VALUES).optional(),
})

export type BoatSearchFilter = z.infer<typeof boatSearchFilterSchema>

const priceAsInteger = sql<number>`CAST(NULLIF(${boats.price}, '') AS INTEGER)`
const lengthAsReal = sql<number>`CAST(NULLIF(${boats.length}, '') AS REAL)`
const searchTypeText = sql<string>`coalesce(${boats.searchType}, '')`
const listingTypeText = sql<string>`coalesce(${boats.listingType}, '')`
const descriptionText = sql<string>`coalesce(${boats.description}, '')`
const fullText = sql<string>`coalesce(${boats.fullText}, '')`
const propulsionText = sql<string>`coalesce(${boats.propulsion}, '')`
const hullShapeText = sql<string>`coalesce(${boats.hullShape}, '')`
const keelTypeText = sql<string>`coalesce(${boats.keelType}, '')`
const modelText = sql<string>`coalesce(${boats.model}, '')`

function inventorySearchTokens(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((token) => token.replaceAll(/[%_\\]/g, '').trim())
    .filter((token) => token.length > 0)
    .slice(0, 16)
}

function sanitizeLikePattern(value: string) {
  return value.replaceAll(/[%_\\]/g, '')
}

function matchAnyInventoryText(fields: readonly SQL<string>[], terms: readonly string[]) {
  const conditions: SQL[] = []

  for (const rawTerm of terms) {
    const term = sanitizeLikePattern(rawTerm)
    if (!term) continue

    for (const field of fields) {
      conditions.push(like(field, `%${term}%`))
    }
  }

  return conditions.length ? or(...conditions)! : undefined
}

function combineOr(...clauses: Array<SQL | undefined>) {
  const filteredClauses = clauses.filter((clause): clause is SQL => Boolean(clause))
  return filteredClauses.length ? or(...filteredClauses)! : undefined
}

function sailModeCondition() {
  return combineOr(
    matchAnyInventoryText([searchTypeText, listingTypeText], ['sail']),
    matchAnyInventoryText(
      [descriptionText, fullText, propulsionText],
      [' sailboat', ' sailing', 'sloop', 'ketch', 'cutter', 'yawl', 'schooner', 'bluewater sail'],
    ),
    matchAnyInventoryText([keelTypeText], ['keel']),
  )!
}

function subtypeCondition(subtype: BoatInventoryVesselSubtype) {
  switch (subtype) {
    case 'power-center-console':
      return matchAnyInventoryText(
        [listingTypeText, modelText, descriptionText, fullText],
        ['center console', 'open fisherman', 'bay boat', 'dual console', 'fisharound'],
      )
    case 'power-sportfish':
      return matchAnyInventoryText(
        [searchTypeText, listingTypeText, modelText, descriptionText, fullText],
        [
          'sportfish',
          'sport fishing',
          'convertible',
          'express fisherman',
          'super sport',
          'tournament',
        ],
      )
    case 'power-catamaran':
      return matchAnyInventoryText(
        [listingTypeText, modelText, descriptionText, fullText, hullShapeText],
        ['catamaran', 'world cat', 'tomcat', 'twin vee'],
      )
    case 'power-cruiser':
      return matchAnyInventoryText(
        [listingTypeText, modelText, descriptionText, fullText],
        ['cruiser', 'trawler', 'motor yacht', 'flybridge', 'pilothouse', 'downeast'],
      )
    case 'sail-sloop':
      return matchAnyInventoryText(
        [listingTypeText, descriptionText, fullText, propulsionText],
        ['sloop', 'cutter', 'ketch', 'yawl', 'schooner'],
      )
    case 'sail-catamaran':
      return matchAnyInventoryText(
        [listingTypeText, descriptionText, fullText, hullShapeText],
        ['catamaran'],
      )
    case 'sail-cruiser':
      return matchAnyInventoryText(
        [listingTypeText, descriptionText, fullText, propulsionText],
        ['cruising sailboat', 'sailing yacht', 'bluewater sail', 'passagemaker sail'],
      )
  }
}

export function boatFilterConditions(filter: BoatSearchFilter): SQL[] {
  const conditions: SQL[] = []
  const effectiveVesselMode: BoatInventoryVesselMode | undefined =
    filter.vesselMode ||
    (filter.vesselSubtype ? BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[filter.vesselSubtype] : undefined)
  const effectiveVesselSubtype =
    filter.vesselSubtype &&
    BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[filter.vesselSubtype] === effectiveVesselMode
      ? filter.vesselSubtype
      : undefined

  if (filter.make) {
    conditions.push(like(boats.make, `%${sanitizeLikePattern(filter.make)}%`))
  }
  if (filter.location) {
    const needle = `%${sanitizeLikePattern(filter.location)}%`
    conditions.push(
      or(
        like(boats.normalizedLocation, needle),
        like(boats.normalizedCity, needle),
        like(boats.normalizedState, needle),
        like(boats.normalizedCountry, needle),
        like(boats.location, needle),
        like(boats.city, needle),
        like(boats.state, needle),
        like(boats.country, needle),
      )!,
    )
  }
  if (filter.minLength != null) {
    conditions.push(gte(lengthAsReal, filter.minLength))
  }
  if (filter.maxLength != null) {
    conditions.push(lte(lengthAsReal, filter.maxLength))
  }
  if (filter.minPrice != null) {
    conditions.push(gte(priceAsInteger, filter.minPrice))
  }
  if (filter.maxPrice != null) {
    conditions.push(lte(priceAsInteger, filter.maxPrice))
  }
  if (filter.q) {
    const tokens = inventorySearchTokens(filter.q)
    for (const token of tokens) {
      const needle = `%${token}%`
      conditions.push(
        or(
          like(boats.make, needle),
          like(boats.model, needle),
          like(boats.description, needle),
          like(boats.listingId, needle),
          like(boats.features, needle),
          like(sql<string>`CAST(${boats.year} AS TEXT)`, needle),
        )!,
      )
    }
  }
  if (effectiveVesselMode) {
    const sailCondition = sailModeCondition()
    conditions.push(effectiveVesselMode === 'sail' ? sailCondition : not(sailCondition))
  }
  if (effectiveVesselSubtype) {
    const matchCondition = subtypeCondition(effectiveVesselSubtype)
    if (matchCondition) {
      conditions.push(matchCondition)
    }
  }
  return conditions
}

type AppDb = DrizzleD1Database<typeof schema>

function buildBoatWhereClause(
  filter: BoatSearchFilter,
  options: {
    updatedAfter?: string
    matchedOnly?: boolean
  } = {},
) {
  const conditions = boatFilterConditions(filter)

  if (options.updatedAfter) {
    conditions.push(gt(boats.updatedAt, options.updatedAfter))
  }

  if (options.matchedOnly) {
    conditions.push(eq(boats.geoStatus, 'matched'))
    conditions.push(isNotNull(boats.geoLat))
    conditions.push(isNotNull(boats.geoLng))
  }

  return and(isNull(boats.supersededByBoatId), ...(conditions.length > 0 ? conditions : []))
}

function buildInventorySortOrder(sort: BoatInventorySort): SQL[] {
  switch (sort) {
    case 'price-asc':
      return [
        asc(sql`CASE WHEN NULLIF(${boats.price}, '') IS NULL THEN 1 ELSE 0 END`),
        asc(sql`CAST(NULLIF(${boats.price}, '') AS INTEGER)`),
        desc(boats.updatedAt),
        desc(boats.id),
      ]
    case 'price-desc':
      return [
        asc(sql`CASE WHEN NULLIF(${boats.price}, '') IS NULL THEN 1 ELSE 0 END`),
        desc(sql`CAST(NULLIF(${boats.price}, '') AS INTEGER)`),
        desc(boats.updatedAt),
        desc(boats.id),
      ]
    case 'year-desc':
      return [
        asc(sql`CASE WHEN ${boats.year} IS NULL THEN 1 ELSE 0 END`),
        desc(sql`${boats.year}`),
        desc(boats.updatedAt),
        desc(boats.id),
      ]
    default:
      return [desc(boats.updatedAt), desc(boats.id)]
  }
}

export async function selectBoatsWithFilters(
  db: AppDb,
  filter: BoatSearchFilter,
  options: {
    limit?: number
    offset?: number
    updatedAfter?: string
    sort?: BoatInventorySort
    matchedOnly?: boolean
  } = {},
) {
  const limit = options.limit ?? 200
  const offset = options.offset ?? 0
  const where = buildBoatWhereClause(filter, {
    updatedAfter: options.updatedAfter,
    matchedOnly: options.matchedOnly,
  })

  return db
    .select(INVENTORY_BOAT_SELECT)
    .from(boats)
    .where(where)
    .orderBy(...buildInventorySortOrder(options.sort ?? 'updated-desc'))
    .limit(limit)
    .offset(offset)
}

export async function countBoatsWithFilters(
  db: AppDb,
  filter: BoatSearchFilter,
  options: { updatedAfter?: string; matchedOnly?: boolean } = {},
) {
  const where = buildBoatWhereClause(filter, {
    updatedAfter: options.updatedAfter,
    matchedOnly: options.matchedOnly,
  })
  const result = await db
    .select({
      total: sql<number>`COUNT(*)`,
    })
    .from(boats)
    .where(where)
    .limit(1)

  return result[0]?.total ?? 0
}
