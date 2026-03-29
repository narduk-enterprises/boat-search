import { z } from 'zod'
import { boats } from '~~/server/database/schema'
import { and, desc, gt, gte, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
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
    conditions.push(gte(sql`CAST(${boats.length} AS REAL)`, filter.minLength))
  }
  if (filter.maxLength != null) {
    conditions.push(lte(sql`CAST(${boats.length} AS REAL)`, filter.maxLength))
  }
  if (filter.minPrice != null) {
    conditions.push(gte(sql`CAST(${boats.price} AS INTEGER)`, filter.minPrice))
  }
  if (filter.maxPrice != null) {
    conditions.push(lte(sql`CAST(${boats.price} AS INTEGER)`, filter.maxPrice))
  }
  return conditions
}

type AppDb = DrizzleD1Database<typeof schema>

export async function selectBoatsWithFilters(
  db: AppDb,
  filter: BoatSearchFilter,
  options: { limit?: number; offset?: number; updatedAfter?: string } = {},
) {
  const limit = options.limit ?? 200
  const offset = options.offset ?? 0
  const conditions = boatFilterConditions(filter)
  if (options.updatedAfter) {
    conditions.push(gt(boats.updatedAt, options.updatedAfter))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  return db
    .select(INVENTORY_BOAT_SELECT)
    .from(boats)
    .where(where)
    .orderBy(desc(sql`CAST(${boats.price} AS INTEGER)`))
    .limit(limit)
    .offset(offset)
}
