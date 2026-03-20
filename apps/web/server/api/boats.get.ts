import { z } from 'zod'
import { boats } from '~~/server/database/schema'
import { desc, like, gte, lte, sql, and } from 'drizzle-orm'

const querySchema = z.object({
  make: z.string().optional(),
  minLength: z.coerce.number().optional(),
  maxLength: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const db = useDatabase(event)
  const query = querySchema.parse(getQuery(event))

  const conditions = []

  if (query.make) {
    conditions.push(like(boats.make, `%${query.make}%`))
  }

  if (query.minLength) {
    conditions.push(gte(sql`CAST(${boats.length} AS REAL)`, query.minLength))
  }

  if (query.maxLength) {
    conditions.push(lte(sql`CAST(${boats.length} AS REAL)`, query.maxLength))
  }

  if (query.minPrice) {
    conditions.push(gte(sql`CAST(${boats.price} AS INTEGER)`, query.minPrice))
  }

  if (query.maxPrice) {
    conditions.push(lte(sql`CAST(${boats.price} AS INTEGER)`, query.maxPrice))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const results = await db
    .select({
      id: boats.id,
      listingId: boats.listingId,
      source: boats.source,
      url: boats.url,
      make: boats.make,
      model: boats.model,
      year: boats.year,
      length: boats.length,
      price: boats.price,
      currency: boats.currency,
      location: boats.location,
      city: boats.city,
      state: boats.state,
      country: boats.country,
      description: boats.description,
      sellerType: boats.sellerType,
      listingType: boats.listingType,
      images: boats.images,
      scrapedAt: boats.scrapedAt,
    })
    .from(boats)
    .where(where)
    .orderBy(desc(sql`CAST(${boats.price} AS INTEGER)`))
    .limit(query.limit)
    .offset(query.offset)

  // Parse images JSON for each result
  return results.map((boat) => ({
    ...boat,
    images: boat.images ? JSON.parse(boat.images) : [],
    price: boat.price ? Number.parseInt(boat.price, 10) : null,
  }))
})
