import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  deriveRecommendationFiltersFromAnswers,
  getEffectiveBuyerAnswers,
  type BuyerProfile,
  type RecommendationFilters,
} from '~~/lib/boatFinder'
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
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoLat: number | null
  geoLng: number | null
  geoPrecision: string | null
  geoStatus: string | null
  description: string | null
  contactInfo: string | null
  contactName: string | null
  contactPhone: string | null
  otherDetails: string | null
  disclaimer: string | null
  features: string | null
  electricalEquipment: string | null
  electronics: string | null
  insideEquipment: string | null
  outsideEquipment: string | null
  additionalEquipment: string | null
  propulsion: string | null
  engineMake: string | null
  engineModel: string | null
  engineYearDetail: string | null
  totalPower: string | null
  engineHours: string | null
  engineTypeDetail: string | null
  driveType: string | null
  fuelTypeDetail: string | null
  propellerType: string | null
  propellerMaterial: string | null
  specifications: string | null
  cruisingSpeed: string | null
  maxSpeed: string | null
  range: string | null
  lengthOverall: string | null
  maxBridgeClearance: string | null
  maxDraft: string | null
  minDraftDetail: string | null
  beamDetail: string | null
  dryWeight: string | null
  windlass: string | null
  electricalCircuit: string | null
  deadriseAtTransom: string | null
  hullMaterial: string | null
  hullShape: string | null
  keelType: string | null
  freshWaterTank: string | null
  fuelTank: string | null
  holdingTank: string | null
  guestHeads: string | null
  sellerType: string | null
  listingType: string | null
  images: string | null
  sourceImages: string | null
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
  normalizedLocation: string | null
  normalizedCity: string | null
  normalizedState: string | null
  normalizedCountry: string | null
  geoLat: number | null
  geoLng: number | null
  geoPrecision: string | null
  geoStatus: string | null
  description: string | null
  contactInfo: string | null
  contactName: string | null
  contactPhone: string | null
  otherDetails: string | null
  disclaimer: string | null
  features: string | null
  electricalEquipment: string | null
  electronics: string | null
  insideEquipment: string | null
  outsideEquipment: string | null
  additionalEquipment: string | null
  propulsion: string | null
  engineMake: string | null
  engineModel: string | null
  engineYearDetail: string | null
  totalPower: string | null
  engineHours: string | null
  engineTypeDetail: string | null
  driveType: string | null
  fuelTypeDetail: string | null
  propellerType: string | null
  propellerMaterial: string | null
  specifications: string | null
  cruisingSpeed: string | null
  maxSpeed: string | null
  range: string | null
  lengthOverall: string | null
  maxBridgeClearance: string | null
  maxDraft: string | null
  minDraftDetail: string | null
  beamDetail: string | null
  dryWeight: string | null
  windlass: string | null
  electricalCircuit: string | null
  deadriseAtTransom: string | null
  hullMaterial: string | null
  hullShape: string | null
  keelType: string | null
  freshWaterTank: string | null
  fuelTank: string | null
  holdingTank: string | null
  guestHeads: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  sourceImages: string[]
  scrapedAt: string
  updatedAt: string
}

export const INVENTORY_BOAT_SELECT = {
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
  normalizedLocation: boats.normalizedLocation,
  normalizedCity: boats.normalizedCity,
  normalizedState: boats.normalizedState,
  normalizedCountry: boats.normalizedCountry,
  geoLat: boats.geoLat,
  geoLng: boats.geoLng,
  geoPrecision: boats.geoPrecision,
  geoStatus: boats.geoStatus,
  description: boats.description,
  contactInfo: boats.contactInfo,
  contactName: boats.contactName,
  contactPhone: boats.contactPhone,
  otherDetails: boats.otherDetails,
  disclaimer: boats.disclaimer,
  features: boats.features,
  electricalEquipment: boats.electricalEquipment,
  electronics: boats.electronics,
  insideEquipment: boats.insideEquipment,
  outsideEquipment: boats.outsideEquipment,
  additionalEquipment: boats.additionalEquipment,
  propulsion: boats.propulsion,
  engineMake: boats.engineMake,
  engineModel: boats.engineModel,
  engineYearDetail: boats.engineYearDetail,
  totalPower: boats.totalPower,
  engineHours: boats.engineHours,
  engineTypeDetail: boats.engineTypeDetail,
  driveType: boats.driveType,
  fuelTypeDetail: boats.fuelTypeDetail,
  propellerType: boats.propellerType,
  propellerMaterial: boats.propellerMaterial,
  specifications: boats.specifications,
  cruisingSpeed: boats.cruisingSpeed,
  maxSpeed: boats.maxSpeed,
  range: boats.range,
  lengthOverall: boats.lengthOverall,
  maxBridgeClearance: boats.maxBridgeClearance,
  maxDraft: boats.maxDraft,
  minDraftDetail: boats.minDraftDetail,
  beamDetail: boats.beamDetail,
  dryWeight: boats.dryWeight,
  windlass: boats.windlass,
  electricalCircuit: boats.electricalCircuit,
  deadriseAtTransom: boats.deadriseAtTransom,
  hullMaterial: boats.hullMaterial,
  hullShape: boats.hullShape,
  keelType: boats.keelType,
  freshWaterTank: boats.freshWaterTank,
  fuelTank: boats.fuelTank,
  holdingTank: boats.holdingTank,
  guestHeads: boats.guestHeads,
  sellerType: boats.sellerType,
  listingType: boats.listingType,
  images: boats.images,
  sourceImages: boats.sourceImages,
  scrapedAt: boats.scrapedAt,
  updatedAt: boats.updatedAt,
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
    sourceImages: parseImages(row.sourceImages),
    price: row.price ? Number.parseInt(row.price, 10) : null,
    description: cleanBoatDescription(row.description),
  }
}

export function deriveRecommendationFilters(profile: BuyerProfile): RecommendationFilters {
  return deriveRecommendationFiltersFromAnswers(getEffectiveBuyerAnswers(profile))
}

export async function resolveActiveBoatId(db: AppDb, boatId: number) {
  const visited = new Set<number>()
  let currentId: number | null = boatId

  while (currentId != null && !visited.has(currentId)) {
    visited.add(currentId)
    const row = await db
      .select({
        id: boats.id,
        supersededByBoatId: boats.supersededByBoatId,
      })
      .from(boats)
      .where(eq(boats.id, currentId))
      .limit(1)
      .get()

    if (!row) return null
    if (row.supersededByBoatId == null) return row.id
    currentId = row.supersededByBoatId
  }

  return null
}

export async function selectBoatsByIds(db: AppDb, ids: number[]) {
  if (!ids.length) return []

  const resolvedIds: number[] = []
  for (const id of ids) {
    const resolvedId = await resolveActiveBoatId(db, id)
    if (resolvedId != null) {
      resolvedIds.push(resolvedId)
    }
  }

  const uniqueResolvedIds = [...new Set(resolvedIds)]
  if (!uniqueResolvedIds.length) return []

  const rows = await db
    .select(INVENTORY_BOAT_SELECT)
    .from(boats)
    .where(inArray(boats.id, uniqueResolvedIds))

  const byId = new Map(rows.map((row) => [row.id, hydrateBoatRow(row)]))
  const seen = new Set<number>()
  const hydrated: InventoryBoat[] = []
  for (const id of resolvedIds) {
    if (seen.has(id)) continue
    const boat = byId.get(id)
    if (!boat) continue
    seen.add(id)
    hydrated.push(boat)
  }

  return hydrated
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
        like(boats.normalizedLocation, pattern),
        like(boats.city, pattern),
        like(boats.normalizedCity, pattern),
        like(boats.state, pattern),
        like(boats.normalizedState, pattern),
        like(boats.country, pattern),
        like(boats.normalizedCountry, pattern),
      )!,
    )
  }

  const rows = await db
    .select(INVENTORY_BOAT_SELECT)
    .from(boats)
    .where(and(isNull(boats.supersededByBoatId), ...(conditions.length ? conditions : [])))
    .orderBy(desc(boats.updatedAt), desc(sql`CAST(${boats.price} AS INTEGER)`))
    .limit(options.limit ?? 120)

  return rows.map(hydrateBoatRow)
}

export async function selectInventoryBoat(db: AppDb, boatId: number) {
  const resolvedBoatId = await resolveActiveBoatId(db, boatId)
  if (resolvedBoatId == null) return null

  const rows = await db
    .select(INVENTORY_BOAT_SELECT)
    .from(boats)
    .where(eq(boats.id, resolvedBoatId))
    .limit(1)

  const row = rows[0]
  return row ? hydrateBoatRow(row) : null
}
