import { isNull, sql } from 'drizzle-orm'
import { boats } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const db = useAppDatabase(event)

  const result = await db
    .select({
      total: sql<number>`COUNT(*)`,
      uniqueMakes: sql<number>`COUNT(DISTINCT ${boats.make})`,
      minPrice: sql<number>`MIN(CAST(${boats.price} AS INTEGER))`,
      maxPrice: sql<number>`MAX(CAST(${boats.price} AS INTEGER))`,
      avgPrice: sql<number>`ROUND(AVG(CAST(${boats.price} AS INTEGER)))`,
      minYear: sql<number>`MIN(${boats.year})`,
      maxYear: sql<number>`MAX(${boats.year})`,
    })
    .from(boats)
    .where(isNull(boats.supersededByBoatId))

  const stats = result[0]

  // Top makes by count
  const topMakes = await db
    .select({
      make: boats.make,
      count: sql<number>`COUNT(*)`,
    })
    .from(boats)
    .where(isNull(boats.supersededByBoatId))
    .groupBy(boats.make)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10)

  return {
    ...stats,
    topMakes: topMakes.filter((m: (typeof topMakes)[number]) => m.make),
  }
})
