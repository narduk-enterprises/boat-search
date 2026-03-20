import { z } from 'zod'
import { boats, xaiAnalyses } from '~~/server/database/schema'
import { like, gte, lte, sql, and, desc } from 'drizzle-orm'
import { analyzeBoats } from '~~/server/utils/xai'

const bodySchema = z.object({
  category: z.string().default('Hatteras'),
  make: z.string().optional(),
  minLength: z.number().default(40),
  maxLength: z.number().default(60),
  userContext: z.string().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  await enforceRateLimit(event, 'analyze', 5, 60_000)

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

  const db = useDatabase(event)

  // Build filter conditions
  const conditions = [
    gte(sql`CAST(${boats.length} AS REAL)`, minLength),
    lte(sql`CAST(${boats.length} AS REAL)`, maxLength),
  ]

  if (make) {
    conditions.push(like(boats.make, `%${make}%`))
  }

  // Fetch matching boats
  const boatList = await db
    .select({
      id: boats.id,
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
    })
    .from(boats)
    .where(and(...conditions))
    .orderBy(desc(sql`CAST(${boats.price} AS INTEGER)`))
    .limit(50)

  if (boatList.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: 'No boats found matching criteria',
    })
  }

  // Call xAI analysis with optional user context
  const result = await analyzeBoats(apiKey, boatList, category, userContext)

  // Store analysis in D1
  const boatIds = boatList.map((b) => b.id)
  await db.insert(xaiAnalyses).values({
    boatIds: JSON.stringify(boatIds),
    prompt: userContext
      ? `${userContext} — Analyze ${boatList.length} ${category} boats (${minLength}-${maxLength}ft)`
      : `Analyze ${boatList.length} ${category} boats (${minLength}-${maxLength}ft)`,
    response: result.content,
    model: 'grok-3-mini',
    category,
    tokensUsed: result.tokensUsed,
    createdAt: new Date().toISOString(),
  })

  return {
    analysis: result.content,
    boatCount: boatList.length,
    category,
    tokensUsed: result.tokensUsed,
  }
})
