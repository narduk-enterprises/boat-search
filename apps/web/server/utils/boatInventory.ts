import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import type { BuyerProfile, RecommendationFilters } from '~~/lib/boatFinder'
import { boats } from '~~/server/database/schema'
import type * as schema from '~~/server/database/schema'

type AppDb = DrizzleD1Database<typeof schema>

type BoatRow = {
  id: number
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string | null
  scrapedAt: string
  updatedAt: string
}

export interface InventoryBoat {
  id: number
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: number | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  scrapedAt: string
  updatedAt: string
}

export function cleanBoatDescription(raw: string | null): string | null {
  if (!raw) return null

  let text = raw
    .replace(/First\s*(?:&\s*)?Last\s*Name[\s\S]*/i, '')
    .replaceAll(/EmailPhoneSubjectComments[\s\S]*/gi, '')
    .replaceAll(/Please contact [\s\S]*/gi, '')
    .replaceAll(/Contact Information[\s\S]*/gi, '')
    .replaceAll(/I'd like to know if the[\s\S]*/gi, '')
    .replaceAll(/Show\s*More[\s\S]*/gi, '')
    .replaceAll(/Trusted\s*Partner\s*\|[\s\S]*/gi, '')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/\s{2,}/g, ' ')
    .trim()

  if (text.length < 10) return null
  if (text.length > 2000) text = text.slice(0, 2000) + '...'

  return text
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

export function hydrateBoatRow(row: BoatRow): InventoryBoat {
  return {
    ...row,
    images: parseImages(row.images),
    price: row.price ? Number.parseInt(row.price, 10) : null,
    description: cleanBoatDescription(row.description),
  }
}

export function deriveRecommendationFilters(profile: BuyerProfile): RecommendationFilters {
  const keywords = [...profile.mustHaves]
  if (profile.primaryUse) keywords.push(profile.primaryUse)
  if (profile.dealBreakers.length) keywords.push(...profile.dealBreakers.slice(0, 2))

  return {
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    lengthMin: profile.lengthMin,
    lengthMax: profile.lengthMax,
    location: profile.targetWatersOrRegion,
    keywords: [...new Set(keywords.map((item) => item.trim()).filter(Boolean))].slice(0, 10),
  }
}

export async function selectBoatsByIds(db: AppDb, ids: number[]) {
  if (!ids.length) return []

  const rows = await db
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
      updatedAt: boats.updatedAt,
    })
    .from(boats)
    .where(inArray(boats.id, ids))

  const byId = new Map(rows.map((row) => [row.id, hydrateBoatRow(row)]))
  return ids.map((id) => byId.get(id)).filter((boat): boat is InventoryBoat => Boolean(boat))
}

export async function selectRecommendationCandidates(
  db: AppDb,
  filters: RecommendationFilters,
  options: { limit?: number } = {},
) {
  const conditions: SQL[] = []

  if (filters.budgetMin != null) {
    conditions.push(gte(sql`CAST(${boats.price} AS INTEGER)`, filters.budgetMin))
  }

  if (filters.budgetMax != null) {
    conditions.push(lte(sql`CAST(${boats.price} AS INTEGER)`, filters.budgetMax))
  }

  if (filters.lengthMin != null) {
    conditions.push(gte(sql`CAST(${boats.length} AS REAL)`, filters.lengthMin))
  }

  if (filters.lengthMax != null) {
    conditions.push(lte(sql`CAST(${boats.length} AS REAL)`, filters.lengthMax))
  }

  if (filters.location) {
    const pattern = `%${filters.location}%`
    conditions.push(
      or(
        like(boats.location, pattern),
        like(boats.city, pattern),
        like(boats.state, pattern),
        like(boats.country, pattern),
      )!,
    )
  }

  const rows = await db
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
      updatedAt: boats.updatedAt,
    })
    .from(boats)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(boats.updatedAt), desc(sql`CAST(${boats.price} AS INTEGER)`))
    .limit(options.limit ?? 120)

  return rows.map(hydrateBoatRow)
}

export async function selectInventoryBoat(db: AppDb, boatId: number) {
  const rows = await db
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
      updatedAt: boats.updatedAt,
    })
    .from(boats)
    .where(eq(boats.id, boatId))
    .limit(1)

  const row = rows[0]
  return row ? hydrateBoatRow(row) : null
}
