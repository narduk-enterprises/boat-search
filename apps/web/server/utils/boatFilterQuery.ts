import { z } from 'zod'
import { boats } from '~~/server/database/schema'
import { and, asc, desc, gt, gte, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { BoatInventorySort } from '~~/app/types/boat-inventory'
import type * as schema from '~~/server/database/schema'
import { INVENTORY_BOAT_SELECT } from '#server/utils/boatInventory'

/** Filters shared by /api/boats, saved searches, and cron matching. */
export const boatSearchFilterSchema = z.object({
  make: z.string().optional(),
  location: z.string().optional(),
  minLength: z.coerce.number().optional(),
  maxLength: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
})

export type BoatSearchFilter = z.infer<typeof boatSearchFilterSchema>

const priceAsInteger = sql<number>`CAST(NULLIF(${boats.price}, '') AS INTEGER)`
const lengthAsReal = sql<number>`CAST(NULLIF(${boats.length}, '') AS REAL)`

export function boatFilterConditions(filter: BoatSearchFilter): SQL[] {
  const conditions: SQL[] = []
  if (filter.make) {
    conditions.push(like(boats.make, `%${filter.make}%`))
  }
  if (filter.location) {
    const needle = `%${filter.location}%`
    conditions.push(
      or(
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
  return conditions
}

type AppDb = DrizzleD1Database<typeof schema>

function buildBoatWhereClause(filter: BoatSearchFilter, updatedAfter?: string) {
  const conditions = boatFilterConditions(filter)

  if (updatedAfter) {
    conditions.push(gt(boats.updatedAt, updatedAfter))
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
  } = {},
) {
  const limit = options.limit ?? 200
  const offset = options.offset ?? 0
  const where = buildBoatWhereClause(filter, options.updatedAfter)

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
  options: { updatedAfter?: string } = {},
) {
  const where = buildBoatWhereClause(filter, options.updatedAfter)
  const result = await db
    .select({
      total: sql<number>`COUNT(*)`,
    })
    .from(boats)
    .where(where)
    .limit(1)

  return result[0]?.total ?? 0
}
