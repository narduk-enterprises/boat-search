import type { H3Event } from 'h3'
import { and, desc, eq, isNull } from 'drizzle-orm'
import type { DrizzleD1Database } from 'drizzle-orm/d1'
import {
  boatFitSummarySchema,
  buildBuyerContext,
  buyerAnswersSchema,
  getEffectiveBuyerAnswers,
  normalizeBuyerProfile,
  ratingFromScore,
  recommendationSessionSchema,
  recommendationSummarySchema,
  type BoatFitSummary,
  type BuyerAnswers,
  type BuyerContext,
  type RecommendationEntry,
  type RecommendationAvoidEntry,
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
  'Offshore tournament fishing': ['offshore', 'tournament', 'sportfish', 'bridge', 'outriggers'],
  'Weekend offshore trips': ['offshore', 'diesel', 'express', 'center console'],
  'Nearshore family fishing': ['family', 'console', 'cockpit', 'day boat'],
  'Bay and inlet fishing': ['bay', 'inshore', 'shallow', 'polling'],
  'Overnight canyon runs': ['overnight', 'berth', 'galley', 'diesel'],
  'Mixed-use sandbar and cruising': ['sandbar', 'lounger', 'family', 'comfortable'],
}

const SOFT_RELAXATION_ORDER: Array<keyof RecommendationFilters> = [
  'location',
  'lengthMax',
  'lengthMin',
]

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
    boat.features,
    boat.electronics,
    boat.additionalEquipment,
    boat.propulsion,
    boat.engineMake,
    boat.engineModel,
    boat.fuelTypeDetail,
    boat.hullMaterial,
    boat.hullShape,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function buildKeywordSet(answers: BuyerAnswers) {
  const useKeywords = answers.facts.primaryUses.flatMap((item) => PRIMARY_USE_KEYWORDS[item] ?? [])

  return [
    ...useKeywords,
    ...answers.preferences.targetSpecies,
    ...answers.preferences.boatStyles,
    ...answers.preferences.ownershipPriorities,
    ...answers.preferences.mustHaves,
    ...answers.preferences.propulsionPreferences,
  ]
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function scoreBoatAgainstProfile(
  boat: InventoryBoat,
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
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
      score -= overBy / filters.budgetMax > 0.25 ? 24 : 12
      tradeoffs.push(`Runs about $${overBy.toLocaleString()} over the stated budget.`)
    }
  }

  if (filters.budgetMin != null && boatPrice != null && boatPrice < filters.budgetMin) {
    tradeoffs.push('Sits below the target budget floor and may indicate compromise or hidden work.')
    score -= 6
  }

  if (filters.lengthMin != null && boatLength != null) {
    if (boatLength >= filters.lengthMin) {
      score += 8
    } else {
      score -= 10
      tradeoffs.push(`Comes in shorter than the requested ${filters.lengthMin} ft minimum.`)
    }
  }

  if (filters.lengthMax != null && boatLength != null) {
    if (boatLength <= filters.lengthMax) {
      score += 8
      reasons.push('Fits the requested size band.')
    } else {
      score -= 10
      tradeoffs.push(`Runs longer than the requested ${filters.lengthMax} ft cap.`)
    }
  }

  if (filters.location) {
    const locationMatch = text.includes(filters.location.toLowerCase())
    if (locationMatch) {
      score += 10
      reasons.push(`Matches the target waters or search region: ${filters.location}.`)
    } else {
      score -= 4
      tradeoffs.push(`Not obviously located in ${filters.location}.`)
    }
  }

  for (const keyword of buildKeywordSet(answers)) {
    if (text.includes(keyword)) {
      score += keyword.length > 12 ? 5 : 3
    }
  }

  for (const mustHave of answers.preferences.mustHaves) {
    if (text.includes(mustHave.toLowerCase())) {
      score += 6
      reasons.push(`Mentions must-have: ${mustHave}.`)
    }
  }

  for (const dealBreaker of answers.preferences.dealBreakers) {
    if (text.includes(dealBreaker.toLowerCase())) {
      score -= 16
      tradeoffs.push(`Includes deal-breaker signal: ${dealBreaker}.`)
    }
  }

  if (
    answers.preferences.propulsionPreferences.includes('Diesel inboards') &&
    text.includes('diesel')
  ) {
    score += 4
    reasons.push('Matches the stated diesel preference.')
  }

  if (
    answers.preferences.overnightComfort &&
    ['overnight', 'berth', 'cabin', 'head'].some((keyword) => text.includes(keyword))
  ) {
    score += 4
  }

  if (
    answers.reflectiveAnswers.partnerAlignment ===
      'This will create tension if the boat is wrong' &&
    !['cabin', 'head', 'comfortable', 'seating'].some((keyword) => text.includes(keyword))
  ) {
    score -= 4
    tradeoffs.push('Looks like a harder sell for the household if non-anglers are in the picture.')
  }

  if (
    answers.reflectiveAnswers.ownershipStressors.includes('Constant punch lists') &&
    !boat.description
  ) {
    score -= 6
    tradeoffs.push('Sparse listing detail raises the risk of punch-list surprises.')
  }

  if (context.reflectiveContext.length > 0 && answers.openContextNote) {
    reasons.push('The broader life-fit context has been considered alongside fishability.')
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
  if (rating === 'strong-fit') return 'Worth a close look in the current inventory'
  return 'Interesting option with clear trade-offs'
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

function buildLifeFitNote(answers: BuyerAnswers) {
  if (!answers.reflectiveAnswers.partnerAlignment && !answers.reflectiveAnswers.dreamVsPractical) {
    return ''
  }

  return [
    answers.reflectiveAnswers.partnerAlignment
      ? `Household alignment: ${answers.reflectiveAnswers.partnerAlignment.toLowerCase()}.`
      : '',
    answers.reflectiveAnswers.dreamVsPractical
      ? `Buying posture: ${answers.reflectiveAnswers.dreamVsPractical.toLowerCase()}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 480)
}

function uniqueNotes(items: string[], limit: number) {
  return [...new Set(items.filter(Boolean))].slice(0, limit)
}

function joinSentenceBlock(items: string[], fallback: string, limit = 2) {
  const notes = uniqueNotes(items, limit)
  return notes.length ? notes.join(' ') : fallback
}

function buildRecommendationNarrative(
  boat: InventoryBoat,
  match: ReturnType<typeof scoreBoatAgainstProfile>,
) {
  return joinSentenceBlock(
    [
      ...match.reasons,
      boat.location
        ? `It is currently listed in ${boat.location}, so the geography is easy to inspect further.`
        : '',
    ],
    'This listing stays closest to the mission, budget, and ownership reality described in the brief.',
  )
}

function buildRecommendationTradeoffNarrative(
  boat: InventoryBoat,
  match: ReturnType<typeof scoreBoatAgainstProfile>,
) {
  return joinSentenceBlock(
    [
      ...match.tradeoffs,
      boat.description
        ? 'You should still verify engine hours, service history, and survey findings from the source listing before treating it as a true finalist.'
        : 'The listing itself is thin enough that engine, condition, and equipment verification matters more than usual.',
    ],
    'Engine hours, maintenance history, and survey details still need to be verified before this becomes a committed pursuit.',
  )
}

function buildAvoidHeadline(score: number) {
  if (score <= 44) return 'Poor use of your time for this brief'
  if (score <= 58) return 'Lower-priority listing to pass on first'
  return 'Only worth revisiting if the better fits fall through'
}

function buildAvoidNarrative(
  boat: InventoryBoat,
  match: ReturnType<typeof scoreBoatAgainstProfile>,
) {
  return joinSentenceBlock(
    [
      ...match.tradeoffs,
      ...match.reasons.slice(2),
      boat.description
        ? 'Relative to the stronger candidates, this listing asks you to swallow more compromises without giving enough back.'
        : 'Because the listing is sparse, it asks for more diligence work while already trailing the stronger fits.',
    ],
    'Relative to the stronger candidates in this run, this boat demands more compromises than it justifies.',
  )
}

function buildFallbackAvoidEntries(
  scoredCandidates: Array<{
    boat: InventoryBoat
    match: ReturnType<typeof scoreBoatAgainstProfile>
  }>,
  recommendedBoatIds: Set<number>,
) {
  return scoredCandidates
    .slice()
    .reverse()
    .filter(({ boat }) => !recommendedBoatIds.has(boat.id))
    .slice(0, 3)
    .map(({ boat, match }) => ({
      boatId: boat.id,
      headline: buildAvoidHeadline(match.score),
      whyToAvoid: buildAvoidNarrative(boat, match),
      watchouts: uniqueNotes(
        [
          ...match.tradeoffs,
          boat.description
            ? 'Verify survey, engine hours, and service records before spending serious time on this listing.'
            : 'Sparse listing detail raises the diligence burden immediately.',
        ],
        3,
      ),
      score: match.score,
    })) satisfies RecommendationAvoidEntry[]
}

function buildFallbackSummary(
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  candidates: InventoryBoat[],
  context: BuyerContext,
  relaxedConstraints: string[],
): RecommendationSummary {
  if (!candidates.length) {
    return {
      generatedBy: 'fallback',
      querySummary: `We searched ${summarizeFilters(filters)} and did not find clean matches in the current fishing inventory.`,
      overallAdvice:
        'The current live inventory does not give you a clean shortlist at these settings. Widen the region first, then consider easing the size band or budget ceiling if the mission still feels right. The goal here is to preserve your real guardrails while getting enough viable boats into the pool to compare honestly.',
      topPickBoatId: null,
      recommendations: [],
      boatsToAvoid: [],
      lifeFitNote: buildLifeFitNote(answers),
      meta: {
        resolvedModel: null,
        selectionSource: 'not-used',
        contextSummaries: {
          hardConstraints: relaxedConstraints.length
            ? [
                ...context.filterSummary.hardConstraintSummary,
                `Relaxed: ${relaxedConstraints.join(', ')}`,
              ]
            : context.filterSummary.hardConstraintSummary,
          softPreferences: context.filterSummary.softPreferenceSummary,
          reflectiveContext: context.filterSummary.reflectiveSummary,
        },
      },
    }
  }

  const scoredCandidates = candidates
    .map((boat) => ({
      boat,
      match: scoreBoatAgainstProfile(boat, answers, filters, context),
    }))
    .sort((left, right) => right.match.score - left.match.score)

  const ranked = scoredCandidates.slice(0, 8)

  const recommendedBoatIds = new Set(ranked.map(({ boat }) => boat.id))

  return {
    generatedBy: 'fallback',
    querySummary: `We searched ${summarizeFilters(filters)} for ${answers.facts.primaryUses.join(', ').toLowerCase()} and ranked the closest matches.`,
    overallAdvice:
      'These results are ranked against the hard guardrails first, then the softer fishability and ownership preferences, and finally the family and life-fit reality you described. Start with the best-fit listings before spending time on the lower-ranked options, because the weaker boats usually fail on several fronts at once rather than one small detail. Use the source links to verify condition, service history, and equipment before you let any listing become emotionally real.',
    topPickBoatId: ranked[0]?.boat.id ?? null,
    recommendations: ranked.map(({ boat, match }) => ({
      boatId: boat.id,
      rating: ratingFromScore(match.score),
      headline: buildRecommendationHeadline(boat, ratingFromScore(match.score)),
      whyItFits: buildRecommendationNarrative(boat, match),
      tradeoffs: buildRecommendationTradeoffNarrative(boat, match),
      score: match.score,
    })),
    boatsToAvoid: buildFallbackAvoidEntries(scoredCandidates, recommendedBoatIds),
    lifeFitNote: buildLifeFitNote(answers),
    meta: {
      resolvedModel: null,
      selectionSource: 'not-used',
      contextSummaries: {
        hardConstraints: relaxedConstraints.length
          ? [
              ...context.filterSummary.hardConstraintSummary,
              `Relaxed: ${relaxedConstraints.join(', ')}`,
            ]
          : context.filterSummary.hardConstraintSummary,
        softPreferences: context.filterSummary.softPreferenceSummary,
        reflectiveContext: context.filterSummary.reflectiveSummary,
      },
    },
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

function buildRecommendationPromptPayloadInternal(
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
  relaxedConstraints: string[],
  candidates: InventoryBoat[],
) {
  const scoredCandidates = candidates
    .map((boat) => ({
      boat,
      score: scoreBoatAgainstProfile(boat, answers, filters, context).score,
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 24)

  const systemPrompt = `You are an expert offshore fishing boat buyer's agent.

Return valid JSON only with this shape:
{
  "generatedBy": "ai",
  "querySummary": "one short sentence",
  "overallAdvice": "3-6 sentences of practical buyer guidance",
  "topPickBoatId": 123,
  "lifeFitNote": "optional short note about the buyer's real-life fit",
  "recommendations": [
    {
      "boatId": 123,
      "rating": "best-fit|strong-fit|stretch",
      "headline": "short verdict",
      "whyItFits": "2-4 sentences tied to the profile",
      "tradeoffs": "1-2 sentences about the main compromises and diligence needed",
      "score": 0
    }
  ],
  "boatsToAvoid": [
    {
      "boatId": 456,
      "headline": "short verdict",
      "whyToAvoid": "2-4 sentences explaining why this is a poor use of time for this buyer",
      "watchouts": ["...", "..."],
      "score": 0
    }
  ]
}

Rules:
- Return at most 8 recommendations.
- Return at most 3 boatsToAvoid.
- Use only boat IDs from the provided candidates.
- Keep the writing concrete, specific, and useful enough that the buyer can decide where to click next.
- Use reflective context for tone and life-fit framing, not to invent hard constraints.
- Treat anything in "Uncertainties" as unresolved context, not as an implied preference.
- If listing details are sparse or noisy, say what needs verification instead of inventing specifics.
- Do not recommend a propulsion, maintenance, or comfort strategy unless the buyer profile or listing details support it.
- Use boatsToAvoid for listings that are weak fits, bad tradeoffs, or simply poor uses of this buyer's time relative to stronger candidates.
- Scores must be integers between 0 and 100.
- If the inventory is weak, say so in overallAdvice.
- Never include markdown fences or extra commentary.`

  const userPrompt = `Buyer brief:
${context.buyerBrief}

Hard constraints:
${JSON.stringify(context.hardConstraints, null, 2)}

Soft preferences:
${JSON.stringify(context.softPreferences, null, 2)}

Reflective context:
${JSON.stringify(context.reflectiveContext, null, 2)}

Uncertainties:
${JSON.stringify(context.uncertainties, null, 2)}

Structured filters applied:
${JSON.stringify(filters, null, 2)}

Relaxed constraints to keep inventory viable:
${JSON.stringify(relaxedConstraints, null, 2)}

  Candidate boats:
${scoredCandidates.map(({ boat, score }) => formatBoatForPrompt(boat, score)).join('\n\n')}`

  return { systemPrompt, userPrompt, scoredCandidates }
}

export function buildRecommendationPromptPayload(
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
  relaxedConstraints: string[],
  candidates: InventoryBoat[],
) {
  return buildRecommendationPromptPayloadInternal(
    answers,
    filters,
    context,
    relaxedConstraints,
    candidates,
  )
}

async function requestAiRecommendationSummary(
  event: H3Event,
  apiKey: string,
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
  relaxedConstraints: string[],
  candidates: InventoryBoat[],
) {
  const { systemPrompt, userPrompt } = buildRecommendationPromptPayload(
    answers,
    filters,
    context,
    relaxedConstraints,
    candidates,
  )

  const response = await callXAI(
    event,
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { task: 'recommendation', temperature: 0.2, maxTokens: 6500, reasoningEffort: 'high' },
  )

  const parsed = parseAiJson(response.content, (value) => recommendationSummarySchema.parse(value))
  if (!parsed) {
    return null
  }

  return {
    ...parsed,
    meta: {
      resolvedModel: response.model,
      selectionSource: response.selectionSource,
      contextSummaries: {
        hardConstraints: relaxedConstraints.length
          ? [
              ...context.filterSummary.hardConstraintSummary,
              `Relaxed: ${relaxedConstraints.join(', ')}`,
            ]
          : context.filterSummary.hardConstraintSummary,
        softPreferences: context.filterSummary.softPreferenceSummary,
        reflectiveContext: context.filterSummary.reflectiveSummary,
      },
    },
  } satisfies RecommendationSummary
}

async function fetchCandidatesWithRelaxations(db: AppDb, filters: RecommendationFilters) {
  let activeFilters = { ...filters }
  let relaxedConstraints: string[] = []
  let candidates = await selectRecommendationCandidates(db, activeFilters, { limit: 120 })

  if (candidates.length >= 6) {
    return { filters: activeFilters, candidates, relaxedConstraints }
  }

  for (const key of SOFT_RELAXATION_ORDER) {
    if (activeFilters[key] == null) continue
    activeFilters = { ...activeFilters, [key]: undefined }
    relaxedConstraints = [...relaxedConstraints, key]
    candidates = await selectRecommendationCandidates(db, activeFilters, { limit: 120 })
    if (candidates.length >= 6) break
  }

  return { filters: activeFilters, candidates, relaxedConstraints }
}

export async function buildRecommendationSessionResult(
  event: H3Event,
  db: AppDb,
  profileInput: unknown,
  apiKey?: string,
) {
  const profile = normalizeBuyerProfile(profileInput)
  const answers = buyerAnswersSchema.parse(getEffectiveBuyerAnswers(profile))
  let filters = deriveRecommendationFilters(profile)
  const context = buildBuyerContext(answers)
  const relaxed = await fetchCandidatesWithRelaxations(db, filters)
  filters = relaxed.filters
  const candidates = relaxed.candidates
  const fallbackSummary = buildFallbackSummary(
    answers,
    filters,
    candidates,
    context,
    relaxed.relaxedConstraints,
  )
  let summary = fallbackSummary

  if (apiKey && candidates.length) {
    try {
      const aiSummary = await requestAiRecommendationSummary(
        event,
        apiKey,
        answers,
        filters,
        context,
        relaxed.relaxedConstraints,
        candidates,
      )
      if (aiSummary) {
        summary = aiSummary
        if (summary.recommendations.length === 0 && fallbackSummary.recommendations.length > 0) {
          summary = {
            ...summary,
            recommendations: fallbackSummary.recommendations,
            topPickBoatId: summary.topPickBoatId ?? fallbackSummary.topPickBoatId,
          }
        }
        if (summary.boatsToAvoid.length === 0 && fallbackSummary.boatsToAvoid.length > 0) {
          summary = {
            ...summary,
            boatsToAvoid: fallbackSummary.boatsToAvoid,
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
      : candidates
          .map((boat) => ({
            boat,
            score: scoreBoatAgainstProfile(boat, answers, filters, context).score,
          }))
          .sort((left, right) => right.score - left.score)
          .slice(0, 8)
          .map((item) => item.boat.id)

  return {
    profile: {
      ...profile,
      normalizedContext: context,
    },
    filters,
    summary,
    rankedBoatIds,
    boats: await selectBoatsByIds(db, [
      ...new Set([...rankedBoatIds, ...summary.boatsToAvoid.map((item) => item.boatId)]),
    ]),
    candidateCount: candidates.length,
  }
}

function buildFallbackFitSummary(
  answers: BuyerAnswers,
  boat: InventoryBoat,
  filters: RecommendationFilters,
  context: BuyerContext,
  recommendation?: RecommendationEntry,
): BoatFitSummary {
  const score =
    recommendation?.score ?? scoreBoatAgainstProfile(boat, answers, filters, context).score
  const rating = recommendation?.rating ?? ratingFromScore(score)
  const verdict =
    rating === 'best-fit' ? 'strong-fit' : rating === 'strong-fit' ? 'mixed-fit' : 'weak-fit'
  const match = scoreBoatAgainstProfile(boat, answers, filters, context)

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
      `Based on your buyer brief, this listing scores ${score}/100 against budget, size, mission, ownership reality, and the trade-offs you called out.`,
    pros:
      match.reasons.length > 0
        ? match.reasons
        : ['It remains one of the closer matches in the current inventory.'],
    cons:
      match.tradeoffs.length > 0
        ? match.tradeoffs
        : ['You still need to verify engine, condition, and survey details on the source listing.'],
    lifeFitNote: buildLifeFitNote(answers),
  }
}

function buildFitSummaryPromptPayloadInternal(
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
  boat: InventoryBoat,
  recommendation?: RecommendationEntry,
) {
  const systemPrompt = `You are an expert offshore fishing boat buyer's agent.

Return valid JSON only:
{
  "generatedBy": "ai",
  "verdict": "strong-fit|mixed-fit|weak-fit",
  "headline": "short verdict",
  "summary": "3-5 sentences tailored to the buyer",
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "lifeFitNote": "optional short note about family, time, or ownership reality"
}

Rules:
- Keep it detailed but readable.
- Tie the explanation to the buyer's stated profile and reflective context.
- Treat skipped or not-sure answers as open questions to verify, not as assumed preferences.
- If listing details are sparse or noisy, call out what should be verified instead of inventing specifics.
- Mention the biggest fit positives and negatives.
- Return 2-4 pros and 2-4 cons.
- No markdown fences.`

  const userPrompt = `Buyer brief:
${context.buyerBrief}

Hard constraints:
${JSON.stringify(context.hardConstraints, null, 2)}

Soft preferences:
${JSON.stringify(context.softPreferences, null, 2)}

Reflective context:
${JSON.stringify(context.reflectiveContext, null, 2)}

Uncertainties:
${JSON.stringify(context.uncertainties, null, 2)}

Structured filters:
${JSON.stringify(filters, null, 2)}

Boat:
${JSON.stringify(boat, null, 2)}

Prior recommendation context:
${JSON.stringify(recommendation ?? null, null, 2)}`

  return { systemPrompt, userPrompt }
}

export function buildFitSummaryPromptPayload(
  answers: BuyerAnswers,
  filters: RecommendationFilters,
  context: BuyerContext,
  boat: InventoryBoat,
  recommendation?: RecommendationEntry,
) {
  return buildFitSummaryPromptPayloadInternal(answers, filters, context, boat, recommendation)
}

async function requestAiFitSummary(
  event: H3Event,
  apiKey: string,
  answers: BuyerAnswers,
  boat: InventoryBoat,
  filters: RecommendationFilters,
  context: BuyerContext,
  recommendation?: RecommendationEntry,
) {
  const { systemPrompt, userPrompt } = buildFitSummaryPromptPayload(
    answers,
    filters,
    context,
    boat,
    recommendation,
  )

  const response = await callXAI(
    event,
    apiKey,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { task: 'fit-summary', temperature: 0.2, maxTokens: 1800, reasoningEffort: 'high' },
  )

  return parseAiJson(response.content, (value) => boatFitSummarySchema.parse(value))
}

export async function buildBoatFitSummaryResult(
  event: H3Event,
  db: AppDb,
  options: {
    boatId: number
    profileInput: unknown
    session?: RecommendationSession | null
    apiKey?: string
  },
) {
  const profile = normalizeBuyerProfile(options.profileInput)
  const answers = buyerAnswersSchema.parse(getEffectiveBuyerAnswers(profile))
  const filters = deriveRecommendationFilters(profile)
  const context = buildBuyerContext(answers)
  const boat = await selectInventoryBoat(db, options.boatId)

  if (!boat) {
    throw createError({ statusCode: 404, statusMessage: 'Boat not found' })
  }

  const recommendation = options.session?.resultSummary.recommendations.find(
    (item) => item.boatId === boat.id,
  )
  const fallback = buildFallbackFitSummary(answers, boat, filters, context, recommendation)

  if (!options.apiKey) {
    return fallback
  }

  try {
    return (
      (await requestAiFitSummary(
        event,
        options.apiKey,
        answers,
        boat,
        filters,
        context,
        recommendation,
      )) ?? fallback
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
    profileSnapshot: normalizeBuyerProfile(JSON.parse(row.profileSnapshotJson)),
    generatedFilters: JSON.parse(row.generatedFilterJson),
    resultSummary: recommendationSummarySchema.parse(JSON.parse(row.resultSummaryJson)),
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
