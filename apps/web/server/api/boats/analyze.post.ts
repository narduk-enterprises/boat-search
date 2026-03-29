import { z } from 'zod'
import { boats, xaiAnalyses } from '~~/server/database/schema'
import { and, desc, gte, isNull, like, lte, sql, type SQL } from 'drizzle-orm'
import { definePublicMutation } from '#layer/server/utils/mutation'
import { analyzeBoats } from '~~/server/utils/xai'

const bodySchema = z.object({
  category: z.string().default(''),
  make: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  userContext: z.string().max(2000).optional(),
})

const analyzeRateLimit = {
  namespace: 'boats-analyze',
  maxRequests: 5,
  windowMs: 60_000,
} as const

type BoatListRow = {
  id: number
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  location: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  source: string | null
  images: string | null
}

type BoatMapEntry = {
  images: string[]
  make: string | null
  model: string | null
  year: number | null
  price: string | null
  length: string | null
  location: string | null
  url: string
}

export default definePublicMutation(
  {
    rateLimit: analyzeRateLimit,
  },
  async ({ event }) => {
    const config = useRuntimeConfig()
    const apiKey = config.xaiApiKey

    if (!apiKey) {
      throw createError({ statusCode: 500, statusMessage: 'XAI_API_KEY is not configured' })
    }

    const body = bodySchema.safeParse(await readBody(event))
    if (!body.success) {
      throw createError({ statusCode: 400, statusMessage: body.error.message })
    }

    const { category, make, minLength, maxLength, userContext } = body.data

    const db = useAppDatabase(event)

    // Build filter conditions
    const conditions: SQL[] = []

    if (minLength) {
      conditions.push(gte(sql`CAST(${boats.length} AS REAL)`, minLength))
    }

    if (maxLength) {
      conditions.push(lte(sql`CAST(${boats.length} AS REAL)`, maxLength))
    }

    if (make) {
      conditions.push(like(boats.make, `%${make}%`))
    }

    // Fetch matching boats with descriptions and images
    const boatList = await db
      .select({
        id: boats.id,
        url: boats.url,
        make: boats.make,
        model: boats.model,
        year: boats.year,
        length: boats.length,
        price: boats.price,
        location: boats.location,
        description: boats.description,
        sellerType: boats.sellerType,
        listingType: boats.listingType,
        source: boats.source,
        images: boats.images,
      })
      .from(boats)
      .where(and(isNull(boats.supersededByBoatId), ...(conditions.length > 0 ? conditions : [])))
      .orderBy(desc(sql`CAST(${boats.price} AS INTEGER)`))
      .limit(500)

    if (boatList.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: 'No boats found matching criteria',
      })
    }

    // Enrich with photo count for Grok context
    const enrichedBoats = boatList.map((boat: BoatListRow) => {
      const imgs = boat.images ? JSON.parse(boat.images) : []
      return {
        ...boat,
        photoCount: Array.isArray(imgs) ? imgs.length : 0,
      }
    })

    // Call xAI analysis with optional user context
    const result = await analyzeBoats(event, apiKey, enrichedBoats, category, userContext)

    // Store analysis in D1
    const boatIds = boatList.map((boat: BoatListRow) => boat.id)
    await db.insert(xaiAnalyses).values({
      boatIds: JSON.stringify(boatIds),
      prompt: userContext
        ? `${userContext} — Analyze ${boatList.length} ${category || 'all'} boats`
        : `Analyze ${boatList.length} ${category || 'all'} boats`,
      response: result.content,
      model: result.model,
      category,
      tokensUsed: result.tokensUsed,
      createdAt: new Date().toISOString(),
    })

    // Build boat map for frontend photo rendering
    const boatMap: Record<number, BoatMapEntry> = {}
    for (const boat of boatList) {
      const imgs = boat.images ? JSON.parse(boat.images) : []
      boatMap[boat.id] = {
        images: Array.isArray(imgs) ? imgs.slice(0, 5) : [],
        make: boat.make,
        model: boat.model,
        year: boat.year,
        price: boat.price,
        length: boat.length,
        location: boat.location,
        url: boat.url,
      }
    }

    return {
      analysis: result.content,
      boatCount: boatList.length,
      category,
      tokensUsed: result.tokensUsed,
      boatMap,
    }
  },
)
