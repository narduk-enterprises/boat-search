import { boats } from '~/server/database/schema'
import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDatabase(event)

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

  const stats = result[0]

  // Top makes by count
  const topMakes = await db
    .select({
      make: boats.make,
      count: sql<number>`COUNT(*)`,
    })
    .from(boats)
    .groupBy(boats.make)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10)

  return {
    ...stats,
    topMakes: topMakes.filter((m) => m.make),
  }
})
