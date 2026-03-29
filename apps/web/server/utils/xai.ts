import { createError, type H3Event } from 'h3'
import { kvGet, kvSet } from '#layer/server/utils/kv'

const XAI_RESPONSES_URL = 'https://api.x.ai/v1/responses'
const XAI_MODELS_URL = 'https://api.x.ai/v1/models'
const MODEL_CACHE_KEY = 'xai:model-catalog:v2'
const MODEL_CACHE_TTL_SECONDS = 30 * 60

const RECOMMENDATION_MODEL_CANDIDATES = [
  'grok-4.20-0309-reasoning',
  'grok-4-1-fast-reasoning',
  'grok-4-fast-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4-1',
  'grok-4',
  'grok-3-mini',
] as const

const FIT_SUMMARY_MODEL_CANDIDATES = [
  'grok-4.20-0309-reasoning',
  'grok-4-1-fast-reasoning',
  'grok-4-fast-reasoning',
  'grok-3-mini',
  'grok-4',
] as const

const ANALYSIS_MODEL_CANDIDATES = [
  'grok-4.20-0309-reasoning',
  'grok-4-1-fast-reasoning',
  'grok-4-fast-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4-1',
  'grok-4',
  'grok-3-mini',
] as const

type XaiTaskType = 'recommendation' | 'fit-summary' | 'analysis'
type ModelSelectionSource = 'admin-override' | 'catalog-preferred' | 'fallback-model'

interface XAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface XAIModelRecord {
  id: string
}

interface ResolvedModel {
  model: string
  source: ModelSelectionSource
  supportsReasoningEffort: boolean
}

interface XAIResponsesPayload {
  output?: Array<{
    type?: string
    text?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  output_text?: string
  usage?: {
    total_tokens?: number
    output_tokens?: number
  }
}

function pickCandidate(availableModels: string[], candidates: readonly string[]) {
  for (const candidate of candidates) {
    const exact = availableModels.find((model) => model === candidate)
    if (exact) return exact

    const prefixed = availableModels.find(
      (model) => model.startsWith(`${candidate}-`) || model.includes(candidate),
    )
    if (prefixed) return prefixed
  }

  return null
}

function supportsReasoningEffort(model: string) {
  return model.includes('grok-3-mini')
}

async function loadAvailableModels(event: H3Event, apiKey: string): Promise<string[]> {
  const cached = await kvGet<{ models?: string[] }>(event, MODEL_CACHE_KEY)
  if (cached?.models?.length) {
    return cached.models
  }

  const response = await fetch(XAI_MODELS_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as { data?: XAIModelRecord[] }
  const models = (payload.data ?? [])
    .map((entry) => entry.id)
    .filter((id) => id && !id.includes('image') && !id.includes('video'))
    .sort()

  if (models.length) {
    await kvSet(event, MODEL_CACHE_KEY, { models }, MODEL_CACHE_TTL_SECONDS)
  }

  return models
}

async function resolveGrokModel(
  event: H3Event,
  apiKey: string,
  task: XaiTaskType,
): Promise<ResolvedModel> {
  const override = await kvGet<{ value?: string }>(event, 'admin:chatModel')
  const availableModels = await loadAvailableModels(event, apiKey)

  if (
    override?.value &&
    (availableModels.length === 0 || availableModels.includes(override.value))
  ) {
    return {
      model: override.value,
      source: 'admin-override',
      supportsReasoningEffort: supportsReasoningEffort(override.value),
    }
  }

  const candidates =
    task === 'recommendation'
      ? RECOMMENDATION_MODEL_CANDIDATES
      : task === 'fit-summary'
        ? FIT_SUMMARY_MODEL_CANDIDATES
        : ANALYSIS_MODEL_CANDIDATES

  const candidateModel = pickCandidate(availableModels, candidates)
  if (candidateModel) {
    return {
      model: candidateModel,
      source: 'catalog-preferred',
      supportsReasoningEffort: supportsReasoningEffort(candidateModel),
    }
  }

  const fallbackModel = availableModels[0] ?? 'grok-3-mini'
  return {
    model: fallbackModel,
    source: 'fallback-model',
    supportsReasoningEffort: supportsReasoningEffort(fallbackModel),
  }
}

function extractResponseText(payload: XAIResponsesPayload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  for (const item of payload.output ?? []) {
    if (typeof item.text === 'string' && item.text.trim()) {
      return item.text.trim()
    }

    for (const contentItem of item.content ?? []) {
      if (typeof contentItem.text === 'string' && contentItem.text.trim()) {
        return contentItem.text.trim()
      }
    }
  }

  return ''
}

/**
 * Call xAI Responses API with automatic model resolution and capability guards.
 */
export async function callXAI(
  event: H3Event,
  apiKey: string,
  messages: XAIMessage[],
  options: {
    task: XaiTaskType
    temperature?: number
    maxTokens?: number
    reasoningEffort?: 'low' | 'high'
  },
): Promise<{
  content: string
  tokensUsed: number
  model: string
  selectionSource: ModelSelectionSource
}> {
  const resolved = await resolveGrokModel(event, apiKey, options.task)

  const body: Record<string, unknown> = {
    model: resolved.model,
    input: messages,
    temperature: options.temperature ?? 0.4,
    max_output_tokens: options.maxTokens ?? 4096,
    store: false,
  }

  if (options.reasoningEffort && resolved.supportsReasoningEffort) {
    body.reasoning = { effort: options.reasoningEffort }
  }

  const response = await fetch(XAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw createError({
      statusCode: 502,
      statusMessage: `XAI API error: ${response.status} — ${errorText}`,
    })
  }

  const data = (await response.json()) as XAIResponsesPayload
  return {
    content: extractResponseText(data),
    tokensUsed: data.usage?.total_tokens || data.usage?.output_tokens || 0,
    model: resolved.model,
    selectionSource: resolved.source,
  }
}

interface BoatSummary {
  id: number
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  location: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  source?: string | null
  photoCount?: number
}

function buildSystemPrompt(categoryLabel: string): string {
  return `You are Captain's Market Intelligence, an expert offshore fishing boat analyst with deep experience in marine surveys, brokerage, tournament prep, and lifetime ownership costs.

Focus: ${categoryLabel}${categoryLabel === 'All Fishing Boats' ? ' — analyze the entire inventory for true buying signal, not polite summaries.' : ''}.

Return raw JSON only with this shape:
{
  "marketSnapshot": {
    "title": "Market Snapshot",
    "summary": "2-3 paragraph market overview",
    "stats": {
      "avgPrice": "$XXX,XXX",
      "medianPrice": "$XXX,XXX",
      "priceRange": "$XX,XXX - $X,XXX,XXX",
      "avgAge": "XX years",
      "topMakes": ["Make1", "Make2", "Make3"]
    }
  },
  "boatAnalyses": [
    {
      "boatId": 123,
      "headline": "Short verdict",
      "rating": "BUY|CONSIDER|CAUTION|AVOID",
      "analysis": "3-5 detailed paragraphs",
      "prosAndCons": {
        "pros": ["Specific pro 1", "Specific pro 2"],
        "cons": ["Specific con 1", "Specific con 2"]
      },
      "estimatedAnnualCost": "$XX,XXX - $XX,XXX",
      "fairMarketValue": "$XXX,XXX",
      "negotiationTarget": "$XXX,XXX"
    }
  ],
  "buyersPlaybook": {
    "title": "Buyer's Playbook",
    "content": "2-3 paragraphs"
  },
  "bottomLine": {
    "title": "Bottom Line",
    "content": "1-2 paragraphs",
    "topPickBoatId": 123
  },
  "personalAdvice": "Tailored advice or null"
}

Rules:
- Use only boat IDs supplied in the input.
- Be direct and opinionated.
- Pros and cons must always be arrays of strings.
- Do not wrap the JSON in markdown fences.`
}

/**
 * Analyze a set of boats with structured JSON response.
 */
export async function analyzeBoats(
  event: H3Event,
  apiKey: string,
  boatList: BoatSummary[],
  category?: string,
  userContext?: string,
): Promise<{ content: string; tokensUsed: number; model: string }> {
  const categoryLabel = category || 'All Fishing Boats'

  const makeGroups = new Map<string, number>()
  let totalValue = 0
  let pricedCount = 0

  const boatSummaries = boatList
    .map((boat) => {
      const make = boat.make || 'Unknown'
      makeGroups.set(make, (makeGroups.get(make) || 0) + 1)
      const price = boat.price ? Number.parseInt(boat.price, 10) : 0
      if (price > 0) {
        totalValue += price
        pricedCount++
      }

      const header = [
        `[ID:${boat.id}]`,
        boat.year ? `${boat.year}` : null,
        boat.make,
        boat.model,
        boat.length ? `${boat.length}ft` : null,
        price > 0 ? `$${price.toLocaleString()}` : 'Price N/A',
        boat.location,
        boat.sellerType ? `(${boat.sellerType})` : null,
        boat.source ? `[${boat.source}]` : null,
        boat.photoCount ? `${boat.photoCount} photos` : null,
      ].filter(Boolean)

      const description = boat.description
        ? `\nDescription: ${boat.description.slice(0, 500).replaceAll(/\n+/g, ' ').trim()}${boat.description.length > 500 ? '...' : ''}`
        : ''

      return `${header.join(' ')}${description}`
    })
    .join('\n\n')

  const avgPrice = pricedCount > 0 ? Math.round(totalValue / pricedCount) : 0
  const topMakes = [...makeGroups.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([make, count]) => `${make} (${count})`)
    .join(', ')

  const userPrompt = `Analyze these ${boatList.length} fishing boats currently for sale across the US.

Inventory summary:
- Average asking price: ${avgPrice > 0 ? `$${avgPrice.toLocaleString()}` : 'Unknown'}
- Top makes by count: ${topMakes || 'Unknown'}

Boat listings:
${boatSummaries}
${userContext ? `\n\nBuyer's personal situation:\n${userContext}` : ''}`

  const response = await callXAI(
    event,
    apiKey,
    [
      { role: 'system', content: buildSystemPrompt(categoryLabel) },
      { role: 'user', content: userPrompt },
    ],
    { task: 'analysis', temperature: 0.3, maxTokens: 7000, reasoningEffort: 'high' },
  )

  return {
    content: response.content,
    tokensUsed: response.tokensUsed,
    model: response.model,
  }
}
