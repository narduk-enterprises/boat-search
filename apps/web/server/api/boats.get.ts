import { z } from 'zod'
import { boats } from '~~/server/database/schema'
import { desc, like, gte, lte, sql, and, type SQL } from 'drizzle-orm'

const querySchema = z.object({
  make: z.string().optional(),
  minLength: z.coerce.number().optional(),
  maxLength: z.coerce.number().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const db = useDatabase(event)
  const query = querySchema.parse(getQuery(event))

  const conditions: SQL[] = []

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

  // Parse images JSON and clean descriptions for each result
  const cleaned = results.map((boat: (typeof results)[number]) => ({
    ...boat,
    images: boat.images ? JSON.parse(boat.images) : [],
    price: boat.price ? Number.parseInt(boat.price, 10) : null,
    description: cleanDescription(boat.description),
  }))

  // Deduplicate by make+model+year (keep first = highest price from ordering)
  const seen = new Set<string>()
  return cleaned.filter((boat: (typeof cleaned)[number]) => {
    const key = `${boat.make || ''}-${boat.model || ''}-${boat.year || ''}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

/**
 * Clean scraped description text — removes contact form junk, excessive whitespace,
 * and other artifacts from web scraping.
 */
function cleanDescription(raw: string | null): string | null {
  if (!raw) return null

  let text = raw
    // Remove contact form boilerplate
    .replace(/First\s*(?:&\s*)?Last\s*Name[\s\S]*/i, '')
    .replaceAll(/EmailPhoneSubjectComments[\s\S]*/gi, '')
    .replaceAll(/Please contact [\s\S]*/gi, '')
    .replaceAll(/Contact Information[\s\S]*/gi, '')
    .replaceAll(/I'd like to know if the[\s\S]*/gi, '')
    .replaceAll(/Show\s*More[\s\S]*/gi, '')
    .replaceAll(/Trusted\s*Partner\s*\|[\s\S]*/gi, '')
    // Remove excessive whitespace
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/\s{2,}/g, ' ')
    .trim()

  // If cleaned to nothing, return null
  if (text.length < 10) return null

  // Cap at a reasonable length
  if (text.length > 2000) text = text.slice(0, 2000) + '...'

  return text
}
