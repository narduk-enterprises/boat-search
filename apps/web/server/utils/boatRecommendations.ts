import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  boatFitSummarySchema,
  buyerProfileSchema,
  ratingFromScore,
  recommendationSessionSchema,
  recommendationSummarySchema,
  type BoatFitSummary,
  type BuyerProfile,
  type RecommendationEntry,
  type RecommendationFilters,
  type RecommendationSession,
  type RecommendationSummary,
} from '~~/lib/boatFinder'
import { boatFitSummaries, recommendationSessions } from '~~/server/database/schema'
import type * as schema from '~~/server/database/schema'
import {
  deriveRecommendationFilters,
  selectBoatsByIds,
  selectInventoryBoat,
  selectRecommendationCandidates,
  type InventoryBoat,
} from '~~/server/utils/boatInventory'
import { callXAI } from '~~/server/utils/xai'

type AppDb = DrizzleD1Database<typeof schema>

const PRIMARY_USE_KEYWORDS: Record<string, string[]> = {
  'Offshore tournament fishing': ['offshore', 'tournament', 'convertible', 'sportfish', 'bridge'],
  'Weekend offshore trips': ['offshore', 'diesel', 'convertible', 'express'],
  'Nearshore family fishing': ['family', 'console', 'cockpit', 'day boat'],
  'Bay and inlet fishing': ['bay', 'inshore', 'shallow', 'center console'],
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function stripCodeFences(raw: string) {
  return raw
    .replace(/^```json\s*/, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

function repairJson(raw: string) {
  let repaired = stripCodeFences(raw)
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 !== 0) repaired += '"'
  repaired = repaired.replaceAll(/,\s*([}\]])/g, '$1')

  const stack: string[] = []
  for (const char of repaired) {
    if (char === '{' || char === '[') stack.push(char)
    if (char === '}' && stack.at(-1) === '{') stack.pop()
    if (char === ']' && stack.at(-1) === '[') stack.pop()
  }

  for (const char of stack.reverse()) {
    repaired += char === '{' ? '}' : ']'
  }

  return repaired
}

function parseAiJson<T>(raw: string, parser: (value: unknown) => T): T | null {
  const attempts = [stripCodeFences(raw), repairJson(raw)]

  for (const candidate of attempts) {
    try {
      return parser(JSON.parse(candidate))
    } catch {
      continue
    }
  }

  return null
}

function parseBoatLength(length: string | null) {
  if (!length) return
  const parsed = Number.parseFloat(length)
  if (!Number.isNaN(parsed)) return parsed
}

function boatSearchText(boat: InventoryBoat) {
  return [
    boat.make,
    boat.model,
    boat.location,
    boat.city,
    boat.state,
    boat.description,
    boat.sellerType,
    boat.listingType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function buildKeywordSet(profile: BuyerProfile, filters: RecommendationFilters) {
  const useKeywords = PRIMARY_USE_KEYWORDS[profile.primaryUse] ?? []
  return [...filters.keywords, ...useKeywords]
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function profilePhraseTokenSet(phrases: string[]) {
  return new Set(phrases.map((p) => p.trim().toLowerCase()).filter(Boolean))
}

function scoreBoatAgainstProfile(
  boat: InventoryBoat,
  profile: BuyerProfile,
  filters: RecommendationFilters,
) {
  let score = 50
  const reasons: string[] = []
  const tradeoffs: string[] = []
  const text = boatSearchText(boat)
  const boatPrice = boat.price ?? undefined
  const boatLength = parseBoatLength(boat.length)

  if (filters.budgetMax != null && boatPrice != null) {
    if (boatPrice <= filters.budgetMax) {
      score += 18
      reasons.push('Stays within the target budget ceiling.')
    } else {
      const overBy = boatPrice - filters.budgetMax
      const ratio = overBy / filters.budgetMax
      score -= ratio > 0.25 ? 20 : 10
      tradeoffs.push(`Runs about $${overBy.toLocaleString()} over the stated budget.`)
    }
  }

  if (filters.budgetMin != null && boatPrice != null) {
    if (boatPrice >= filters.budgetMin) {
      score += 6
    } else {
      tradeoffs.push(
        'Sits below the target budget floor and may indicate a trade-off or project boat.',
      )
      score -= 6
    }
  }

  if (filters.lengthMin != null && boatLength != null) {
    if (boatLength >= filters.lengthMin) {
      score += 8
    } else {
      score -= 10
      tradeoffs.push(`Comes in shorter than the requested ${filters.lengthMin}ft minimum.`)
    }
  }

  if (filters.lengthMax != null && boatLength != null) {
    if (boatLength <= filters.lengthMax) {
      score += 8
      reasons.push('Fits the requested size band.')
    } else {
      score -= 10
      tradeoffs.push(`Runs longer than the requested ${filters.lengthMax}ft cap.`)
    }
  }

  if (filters.location) {
    const locationMatch = boatSearchText(boat).includes(filters.location.toLowerCase())
    if (locationMatch) {
      score += 12
      reasons.push(`Matches the target region: ${filters.location}.`)
    } else {
      tradeoffs.push(`Not obviously located in ${filters.location}.`)
      score -= 4
    }
  }

  for (const mustHave of profile.mustHaves) {
    if (text.includes(mustHave.toLowerCase())) {
      score += 5
      reasons.push(`Mentions must-have: ${mustHave}.`)
    }
  }

  for (const dealBreaker of profile.dealBreakers) {
    if (text.includes(dealBreaker.toLowerCase())) {
      score -= 12
      tradeoffs.push(`Includes deal-breaker signal: ${dealBreaker}.`)
    }
  }

  const mustHaveTokens = profilePhraseTokenSet(profile.mustHaves)
  const dealBreakerTokens = profilePhraseTokenSet(profile.dealBreakers)

  for (const keyword of buildKeywordSet(profile, filters)) {
    if (mustHaveTokens.has(keyword) || dealBreakerTokens.has(keyword)) {
      continue
    }
    if (text.includes(keyword)) {
      score += 3
    }
  }

  if (!boat.description) {
    tradeoffs.push('Listing copy is sparse, so confidence is lower than usual.')
    score -= 3
  }

  return {
    score: clampScore(score),
    reasons: [...new Set(reasons)].slice(0, 3),
    tradeoffs: [...new Set(tradeoffs)].slice(0, 3),
  }
}

function buildRecommendationHeadline(boat: InventoryBoat, rating: RecommendationEntry['rating']) {
  if (rating === 'best-fit') return `Strong shortlist candidate from ${boat.source}`
  if (rating === 'strong-fit') return `Worth a close look in the current inventory`
  return `Interesting option with clear trade-offs`
}

function summarizeFilters(filters: RecommendationFilters) {
  const parts: string[] = []
  if (filters.budgetMax != null) parts.push(`up to $${filters.budgetMax.toLocaleString()}`)
  if (filters.lengthMin != null || filters.lengthMax != null) {
    const min = filters.lengthMin ?? '?'
    const max = filters.lengthMax ?? '?'
    parts.push(`${min}-${max}ft`)
  }
  if (filters.location) parts.push(`around ${filters.location}`)
  return parts.length ? parts.join(', ') : 'the current fishing inventory'
}

function buildFallbackSummary(
  profile: BuyerProfile,
  filters: RecommendationFilters,
  candidates: InventoryBoat[],
): RecommendationSummary {
  if (!candidates.length) {
    return {
      generatedBy: 'fallback',
      querySummary: `We searched ${summarizeFilters(filters)} and did not find clean matches in the current fishing inventory.`,
      overallAdvice:
        'Try widening the region, expanding the budget ceiling, or relaxing the target size band. The current inventory is still constrained enough that a broader query should surface more viable boats.',
      topPickBoatId: null,
      recommendations: [],
    }
  }

  const ranked = candidates
    .map((boat) => ({
      boat,
      match: scoreBoatAgainstProfile(boat, profile, filters),
    }))
    .sort((left, right) => right.match.score - left.match.score)
    .slice(0, 8)

  return {
    generatedBy: 'fallback',
    querySummary: `We searched ${summarizeFilters(filters)} for ${profile.primaryUse.toLowerCase()} and ranked the closest matches.`,
    overallAdvice:
      'These results are ranked by fit against your budget, size, region, and checklist signals. Tighten or loosen the questionnaire if the shortlist feels too broad or too thin.',
    topPickBoatId: ranked[0]?.boat.id ?? null,
    recommendations: ranked.map(({ boat, match }) => ({
      boatId: boat.id,
      rating: ratingFromScore(match.score),
      headline: buildRecommendationHeadline(boat, ratingFromScore(match.score)),
      whyItFits:
        match.reasons[0] ??
        'This boat lands closest to your requested budget, length, and fishing profile.',
      tradeoffs:
        match.tradeoffs[0] ?? 'Review the source listing closely for engine and condition details.',
      score: match.score,
    })),
  }
}

function formatBoatForPrompt(boat: InventoryBoat, score: number) {
  const header = [
    `[ID:${boat.id}]`,
    boat.year ? `${boat.year}` : null,
    boat.make,
    boat.model,
    boat.length ? `${boat.length}ft` : null,
    boat.price ? `$${boat.price.toLocaleString()}` : 'Price N/A',
    boat.location,
    boat.source ? `[${boat.source}]` : null,
    `score:${score}`,
  ]
    .filter(Boolean)
    .join(' ')

  const description = boat.description
    ? `Description: ${boat.description.slice(0, 420).replaceAll(/\n+/g, ' ').trim()}`
    : 'Description: limited listing detail'

  return `${header}\n${description}`
}

async function buildAiRecommendationSummary(
  apiKey: string,
  profile: BuyerProfile,
  filters: RecommendationFilters,
  candidates: InventoryBoat[],
) {
  const scoredCandidates = candidates
    .map((boat) => ({
      boat,
      score: scoreBoatAgainstProfile(boat, profile, filters).score,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 24)

  const systemPrompt = `You are an expert offshore fishing boat buyer's agent.

Return valid JSON only with this shape:
{
  "generatedBy": "ai",
  "querySummary": "one short sentence",
  "overallAdvice": "2-4 sentences of practical buyer guidance",
  "topPickBoatId": 123,
  "recommendations": [
    {
      "boatId": 123,
      "rating": "best-fit|strong-fit|stretch",
      "headline": "short verdict",
      "whyItFits": "1-2 sentences tied to the profile",
      "tradeoffs": "1 sentence about the main compromise",
      "score": 0
    }
  ]
}

Rules:
- Return at most 8 recommendations.
- Use only boat IDs from the provided candidates.
- Keep "whyItFits" and "tradeoffs" concise and concrete.
- Scores must be integers between 0 and 100.
- If the inventory is weak, say so in overallAdvice.
- Never include markdown fences or extra commentary.`

  const userPrompt = `Buyer profile:
${JSON.stringify(profile, null, 2)}

Structured filters applied:
${JSON.stringify(filters, null, 2)}

Candidate boats:
${scoredCandidates.map(({ boat, score }) => formatBoatForPrompt(boat, score)).join('\n\n')}`

  const response = await callXAI(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, maxTokens: 6000, reasoningEffort: 'high' },
  )

  return parseAiJson(response.content, (value) => recommendationSummarySchema.parse(value))
}

export async function buildRecommendationSessionResult(
  db: AppDb,
  profileInput: unknown,
  apiKey?: string,
) {
  const profile = buyerProfileSchema.parse(profileInput)
  let filters = deriveRecommendationFilters(profile)
  let candidates = await selectRecommendationCandidates(db, filters)

  if (!candidates.length && filters.location) {
    filters = { ...filters, location: undefined }
    candidates = await selectRecommendationCandidates(db, filters)
  }

  const fallbackSummary = buildFallbackSummary(profile, filters, candidates)
  let summary = fallbackSummary

  if (apiKey && candidates.length) {
    try {
      const aiSummary = await buildAiRecommendationSummary(apiKey, profile, filters, candidates)
      if (aiSummary) {
        summary = aiSummary
        if (summary.recommendations.length === 0 && fallbackSummary.recommendations.length > 0) {
          summary = {
            ...summary,
            recommendations: fallbackSummary.recommendations,
            topPickBoatId: summary.topPickBoatId ?? fallbackSummary.topPickBoatId,
          }
        }
      }
    } catch {
      summary = fallbackSummary
    }
  }

  const rankedBoatIds =
    summary.recommendations.length > 0
      ? summary.recommendations.map((item) => item.boatId)
      : candidates.slice(0, 8).map((boat) => boat.id)

  return {
    profile,
    filters,
    summary,
    rankedBoatIds,
    boats: await selectBoatsByIds(db, rankedBoatIds),
    candidateCount: candidates.length,
  }
}

function buildFallbackFitSummary(
  profile: BuyerProfile,
  boat: InventoryBoat,
  filters: RecommendationFilters,
  recommendation?: RecommendationEntry,
): BoatFitSummary {
  const score = recommendation?.score ?? scoreBoatAgainstProfile(boat, profile, filters).score
  const rating = recommendation?.rating ?? ratingFromScore(score)
  const verdict =
    rating === 'best-fit' ? 'strong-fit' : rating === 'strong-fit' ? 'mixed-fit' : 'weak-fit'
  const match = scoreBoatAgainstProfile(boat, profile, filters)

  return {
    generatedBy: 'fallback',
    verdict,
    headline:
      verdict === 'strong-fit'
        ? 'This boat lines up well with your saved brief.'
        : verdict === 'mixed-fit'
          ? 'This boat is viable, but it comes with trade-offs.'
          : 'This boat looks off-brief for your current goals.',
    summary:
      recommendation?.whyItFits ??
      `Based on your ${profile.primaryUse.toLowerCase()} brief, this listing scores ${score}/100 against budget, size, region, and checklist fit.`,
    pros:
      match.reasons.length > 0
        ? match.reasons
        : ['It remains one of the closer matches in the current inventory.'],
    cons:
      match.tradeoffs.length > 0
        ? match.tradeoffs
        : ['You still need to verify engine, condition, and survey details on the source listing.'],
  }
}

async function buildAiFitSummary(
  apiKey: string,
  profile: BuyerProfile,
  boat: InventoryBoat,
  filters: RecommendationFilters,
  recommendation?: RecommendationEntry,
) {
  const systemPrompt = `You are an expert offshore fishing boat buyer's agent.

Return valid JSON only:
{
  "generatedBy": "ai",
  "verdict": "strong-fit|mixed-fit|weak-fit",
  "headline": "short verdict",
  "summary": "2-3 sentences tailored to the buyer",
  "pros": ["...", "..."],
  "cons": ["...", "..."]
}

Rules:
- Keep it concise.
- Tie the explanation to the buyer's stated profile.
- Mention the biggest fit positives and negatives.
- Return 2-4 pros and 2-4 cons.
- No markdown fences.`

  const userPrompt = `Buyer profile:
${JSON.stringify(profile, null, 2)}

Structured filters:
${JSON.stringify(filters, null, 2)}

Boat:
${JSON.stringify(boat, null, 2)}

Prior recommendation context:
${JSON.stringify(recommendation ?? null, null, 2)}`

  const response = await callXAI(
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.2, maxTokens: 1800, reasoningEffort: 'high' },
  )

  return parseAiJson(response.content, (value) => boatFitSummarySchema.parse(value))
}

export async function buildBoatFitSummaryResult(
  db: AppDb,
  options: {
    boatId: number
    profileInput: unknown
    session?: RecommendationSession | null
    apiKey?: string
  },
) {
  const profile = buyerProfileSchema.parse(options.profileInput)
  const filters = deriveRecommendationFilters(profile)
  const boat = await selectInventoryBoat(db, options.boatId)

  if (!boat) {
    throw createError({ statusCode: 404, statusMessage: 'Boat not found' })
  }

  const recommendation = options.session?.resultSummary.recommendations.find(
    (item) => item.boatId === boat.id,
  )
  const fallback = buildFallbackFitSummary(profile, boat, filters, recommendation)

  if (!options.apiKey) {
    return fallback
  }

  try {
    return (
      (await buildAiFitSummary(options.apiKey, profile, boat, filters, recommendation)) ?? fallback
    )
  } catch {
    return fallback
  }
}

function parseSessionRow(row: {
  id: number
  createdAt: string
  profileSnapshotJson: string
  generatedFilterJson: string
  resultSummaryJson: string
  rankedBoatIdsJson: string
}): RecommendationSession {
  return recommendationSessionSchema.parse({
    id: row.id,
    createdAt: row.createdAt,
    profileSnapshot: JSON.parse(row.profileSnapshotJson),
    generatedFilters: JSON.parse(row.generatedFilterJson),
    resultSummary: JSON.parse(row.resultSummaryJson),
    rankedBoatIds: JSON.parse(row.rankedBoatIdsJson),
  })
}

export async function getRecommendationSessionsForUser(db: AppDb, userId: string) {
  const rows = await db
    .select({
      id: recommendationSessions.id,
      createdAt: recommendationSessions.createdAt,
      profileSnapshotJson: recommendationSessions.profileSnapshotJson,
      generatedFilterJson: recommendationSessions.generatedFilterJson,
      resultSummaryJson: recommendationSessions.resultSummaryJson,
      rankedBoatIdsJson: recommendationSessions.rankedBoatIdsJson,
    })
    .from(recommendationSessions)
    .where(eq(recommendationSessions.userId, userId))
    .orderBy(desc(recommendationSessions.createdAt))

  return rows.map(parseSessionRow)
}

export async function getRecommendationSessionForUser(
  db: AppDb,
  userId: string,
  sessionId: number,
) {
  const row = await db
    .select({
      id: recommendationSessions.id,
      createdAt: recommendationSessions.createdAt,
      profileSnapshotJson: recommendationSessions.profileSnapshotJson,
      generatedFilterJson: recommendationSessions.generatedFilterJson,
      resultSummaryJson: recommendationSessions.resultSummaryJson,
      rankedBoatIdsJson: recommendationSessions.rankedBoatIdsJson,
    })
    .from(recommendationSessions)
    .where(and(eq(recommendationSessions.userId, userId), eq(recommendationSessions.id, sessionId)))
    .get()

  return row ? parseSessionRow(row) : null
}

export async function getLatestRecommendationSessionForUser(db: AppDb, userId: string) {
  const sessions = await getRecommendationSessionsForUser(db, userId)
  return sessions[0] ?? null
}

export async function getCachedBoatFitSummary(
  db: AppDb,
  options: { userId: string; boatId: number; sessionId?: number | null },
) {
  const sessionCondition =
    options.sessionId == null
      ? isNull(boatFitSummaries.sessionId)
      : eq(boatFitSummaries.sessionId, options.sessionId)

  const rows = await db
    .select({
      summaryJson: boatFitSummaries.summaryJson,
    })
    .from(boatFitSummaries)
    .where(
      and(
        eq(boatFitSummaries.userId, options.userId),
        eq(boatFitSummaries.boatId, options.boatId),
        sessionCondition,
      ),
    )
    .orderBy(desc(boatFitSummaries.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return boatFitSummarySchema.parse(JSON.parse(row.summaryJson))
}

export async function cacheBoatFitSummary(
  db: AppDb,
  options: { userId: string; boatId: number; sessionId?: number | null; summary: BoatFitSummary },
) {
  await db.insert(boatFitSummaries).values({
    userId: options.userId,
    boatId: options.boatId,
    sessionId: options.sessionId ?? null,
    summaryJson: JSON.stringify(options.summary),
    createdAt: new Date().toISOString(),
  })
}
