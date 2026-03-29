import { describe, expect, it, vi } from 'vitest'
import {
  buildBuyerContext,
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  createEmptyBuyerProfile,
  recommendationSummarySchema,
} from '../../lib/boatFinder'
import { deriveRecommendationFilters, type InventoryBoat } from '../../server/utils/boatInventory'

vi.mock('~~/server/utils/xai', () => ({
  callXAI: vi.fn(),
}))

const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const XAI_MODELS_URL = 'https://api.x.ai/v1/models'
const MODEL_CANDIDATES = [
  'grok-4.20-0309-reasoning',
  'grok-4-1-fast-reasoning',
  'grok-4-fast-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4-0709',
  'grok-3-mini',
] as const
const SOFT_RELAXATION_ORDER = ['location', 'lengthMax', 'lengthMin'] as const

type Scenario = {
  name: string
  setup: () => ReturnType<typeof createEmptyBuyerAnswers>
}

type PromptPayloadBuilder =
  typeof import('../../server/utils/boatRecommendations').buildRecommendationPromptPayload

type ModelListResponse = {
  data?: Array<{ id?: string }>
}

let buildRecommendationPromptPayload: PromptPayloadBuilder

function createProfile(answers: ReturnType<typeof createEmptyBuyerAnswers>) {
  const profile = createEmptyBuyerProfile()
  profile.coreAnswers = answers
  profile.normalizedContext = buildBuyerContext(answers)
  return profile
}

function toBoatApiUrl(filters: {
  budgetMin?: number
  budgetMax?: number
  lengthMin?: number
  lengthMax?: number
  location?: string
}) {
  const baseUrl = process.env.BOAT_SEARCH_BASE_URL || 'https://boat-search.nard.uk'
  const url = new URL('/api/boats', baseUrl)

  url.searchParams.set('limit', '120')
  url.searchParams.set('sort', 'updated-desc')

  if (filters.budgetMin != null) url.searchParams.set('minPrice', String(filters.budgetMin))
  if (filters.budgetMax != null) url.searchParams.set('maxPrice', String(filters.budgetMax))
  if (filters.lengthMin != null) url.searchParams.set('minLength', String(filters.lengthMin))
  if (filters.lengthMax != null) url.searchParams.set('maxLength', String(filters.lengthMax))
  if (filters.location) url.searchParams.set('location', filters.location)

  return url.toString()
}

async function fetchCandidatesWithRelaxations(
  filters: ReturnType<typeof deriveRecommendationFilters>,
) {
  let activeFilters = { ...filters }
  let relaxedConstraints: string[] = []

  for (;;) {
    const response = await fetch(toBoatApiUrl(activeFilters))
    if (!response.ok) {
      throw new Error(
        `Inventory API failed (${response.status}) for ${toBoatApiUrl(activeFilters)}`,
      )
    }

    const payload = (await response.json()) as { items?: InventoryBoat[]; total?: number }
    const candidates = payload.items ?? []

    if (candidates.length >= 6) {
      return {
        activeFilters,
        relaxedConstraints,
        candidates,
        total: payload.total ?? candidates.length,
      }
    }

    const nextRelaxation = SOFT_RELAXATION_ORDER.find((key) => activeFilters[key] != null)
    if (!nextRelaxation) {
      return {
        activeFilters,
        relaxedConstraints,
        candidates,
        total: payload.total ?? candidates.length,
      }
    }

    activeFilters = { ...activeFilters, [nextRelaxation]: undefined }
    relaxedConstraints = [...relaxedConstraints, nextRelaxation]
  }
}

async function resolveModel(apiKey: string) {
  const response = await fetch(XAI_MODELS_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Model catalog failed (${response.status})`)
  }

  const payload = (await response.json()) as ModelListResponse
  const ids = (payload.data ?? [])
    .map((item) => item.id)
    .filter((value): value is string => Boolean(value))

  for (const candidate of MODEL_CANDIDATES) {
    const exact = ids.find((id) => id === candidate)
    if (exact) return exact
  }

  return ids[0] ?? 'grok-3-mini'
}

async function callXaiRecommendation(
  apiKey: string,
  model: string,
  payload: ReturnType<PromptPayloadBuilder>,
) {
  const response = await fetch(XAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: payload.systemPrompt },
        { role: 'user', content: payload.userPrompt },
      ],
      max_output_tokens: 4200,
      temperature: 0.2,
      store: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`xAI responses failed (${response.status}): ${await response.text()}`)
  }

  const raw = (await response.json()) as {
    output_text?: string
    output?: Array<{ text?: string; content?: Array<{ text?: string }> }>
  }

  const outputText =
    raw.output_text?.trim() ||
    raw.output?.find((item) => item.text?.trim())?.text?.trim() ||
    raw.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.text?.trim())
      ?.text?.trim() ||
    ''

  return recommendationSummarySchema.parse(JSON.parse(outputText))
}

function logScenarioSummary(options: {
  name: string
  filters: ReturnType<typeof deriveRecommendationFilters>
  activeFilters: ReturnType<typeof deriveRecommendationFilters>
  relaxedConstraints: string[]
  total: number
  candidates: InventoryBoat[]
  promptPayload: ReturnType<PromptPayloadBuilder>
  response: ReturnType<typeof recommendationSummarySchema.parse>
  model: string
}) {
  const previewBoats = options.promptPayload.scoredCandidates
    .slice(0, 5)
    .map(({ boat, score }) => ({
      id: boat.id,
      score,
      make: boat.make,
      model: boat.model,
      price: boat.price,
      location: boat.location,
    }))

  const topRecommendations = options.response.recommendations.slice(0, 3).map((item) => ({
    boatId: item.boatId,
    rating: item.rating,
    headline: item.headline,
  }))
  const avoidRecommendations = options.response.boatsToAvoid.slice(0, 3).map((item) => ({
    boatId: item.boatId,
    headline: item.headline,
    score: item.score,
  }))

  console.log(`\n=== ${options.name} ===`)
  console.log('Model:', options.model)
  console.log('Original filters:', options.filters)
  console.log('Active filters:', options.activeFilters)
  console.log('Relaxed constraints:', options.relaxedConstraints)
  console.log('Fetched candidate total:', options.total)
  console.log('Prompt-scored preview boats:', previewBoats)
  console.log('AI query summary:', options.response.querySummary)
  console.log('AI overall advice:', options.response.overallAdvice)
  console.log('AI life-fit note:', options.response.lifeFitNote || '(none)')
  console.log('Top recommendations:', topRecommendations)
  console.log('Avoid first:', avoidRecommendations)
}

const scenarios: Scenario[] = [
  {
    name: 'Tournament buyer in Florida',
    setup: () => {
      const answers = createEmptyBuyerAnswers()
      answers.facts.primaryUses = ['Offshore tournament fishing']
      answers.facts.targetWatersOrRegion = 'Florida'
      answers.facts.budgetMax = 1500000
      answers.facts.lengthMin = 40
      answers.facts.lengthMax = 70
      answers.facts.crewProfile = 'Tournament crew'
      answers.preferences.boatStyles = ['Convertible / sportfish']
      answers.preferences.targetSpecies = ['Billfish', 'Tuna']
      answers.preferences.ownershipPriorities = [
        'Tournament credibility',
        'Cockpit fishability',
        'Range and ride',
      ]
      answers.preferences.mustHaves = ['Tower visibility', 'Diesel inboards']
      answers.reflectiveAnswers.dreamVsPractical = 'Mostly a practical fishing tool'
      answers.openContextNote =
        'This is a serious fishing platform, not a cocktail boat. I care most about fishability and offshore confidence.'
      return buyerAnswersSchema.parse(answers)
    },
  },
  {
    name: 'Family-balance buyer in Alabama',
    setup: () => {
      const answers = createEmptyBuyerAnswers()
      answers.facts.primaryUses = ['Nearshore family fishing', 'Mixed-use sandbar and cruising']
      answers.facts.targetWatersOrRegion = 'Alabama'
      answers.facts.budgetMax = 500000
      answers.facts.lengthMin = 28
      answers.facts.lengthMax = 42
      answers.facts.familyUsage = ['Needs to win over a spouse or partner too']
      answers.preferences.boatStyles = ['Center console', 'Express']
      answers.preferences.ownershipPriorities = ['Family comfort', 'Easy maintenance']
      answers.preferences.mustHaves = ['Easy boarding', 'Shade for family']
      answers.reflectiveAnswers.partnerAlignment = 'Supportive but cautious'
      answers.reflectiveAnswers.familyFrictionPoints = ['Too little comfort for non-anglers']
      answers.reflectiveAnswers.ownershipStressors = ['Owning something the family resents']
      answers.openContextNote =
        'If this feels like a selfish fishing purchase instead of a family win, I will regret it.'
      return buyerAnswersSchema.parse(answers)
    },
  },
  {
    name: 'Practical Texas buyer with uncertainty',
    setup: () => {
      const answers = createEmptyBuyerAnswers()
      answers.facts.primaryUses = ['Weekend offshore trips']
      answers.facts.targetWatersOrRegion = 'Texas'
      answers.facts.travelRadius = 'Anywhere on the Gulf'
      answers.facts.budgetMax = 350000
      answers.facts.lengthMin = 30
      answers.facts.lengthMax = 45
      answers.preferences.targetSpecies = ['Tuna', 'Snapper and grouper']
      answers.preferences.ownershipPriorities = ['Easy maintenance', 'Resale confidence']
      answers.reflectiveAnswers.partnerAlignment = 'Needs clear justification'
      answers.reflectiveAnswers.dreamVsPractical = 'Need the safest sensible decision'
      answers.openContextNote =
        'I do not want a second job or a boat that makes me feel stupid six months later.'
      answers.questionStates = {
        propulsionPreferences: 'not_sure',
        overnightComfort: 'skipped',
      }
      return buyerAnswersSchema.parse(answers)
    },
  },
]

describe('manual boat recommendation scenarios', () => {
  it('runs real-boat recommendation scenarios against production inventory and xAI', async () => {
    const apiKey = process.env.XAI_API_KEY

    expect(apiKey, 'Set XAI_API_KEY before running manual scenarios').toBeTruthy()

    const boatRecommendationUtils = await import('../../server/utils/boatRecommendations')
    buildRecommendationPromptPayload = boatRecommendationUtils.buildRecommendationPromptPayload

    const model = await resolveModel(apiKey!)

    for (const scenario of scenarios) {
      const answers = scenario.setup()
      const profile = createProfile(answers)
      const filters = deriveRecommendationFilters(profile)
      const context = buildBuyerContext(answers)
      const { activeFilters, relaxedConstraints, candidates, total } =
        await fetchCandidatesWithRelaxations(filters)

      expect(candidates.length).toBeGreaterThan(0)

      const promptPayload = buildRecommendationPromptPayload(
        answers,
        activeFilters,
        context,
        relaxedConstraints,
        candidates,
      )
      const response = await callXaiRecommendation(apiKey!, model, promptPayload)

      expect(response.recommendations.length).toBeGreaterThan(0)
      expect(response.recommendations.length).toBeLessThanOrEqual(8)

      logScenarioSummary({
        name: scenario.name,
        filters,
        activeFilters,
        relaxedConstraints,
        total,
        candidates,
        promptPayload,
        response,
        model,
      })
    }
  }, 180_000)
})
