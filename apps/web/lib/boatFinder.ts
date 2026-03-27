import { z } from 'zod'

export const PRIMARY_USE_OPTIONS = [
  'Offshore tournament fishing',
  'Weekend offshore trips',
  'Nearshore family fishing',
  'Bay and inlet fishing',
] as const

export const CREW_SIZE_OPTIONS = [
  'Solo or duo',
  '3-4 anglers',
  '5-6 anglers',
  'Tournament crew',
] as const

export const EXPERIENCE_LEVEL_OPTIONS = [
  'First offshore boat',
  'Moving up from a smaller boat',
  'Experienced owner-operator',
  'Captain-managed program',
] as const

export const MAINTENANCE_APPETITE_OPTIONS = [
  'Low-touch and predictable',
  'Balanced upkeep',
  'Comfortable with major maintenance',
] as const

export const RECOMMENDATION_RATINGS = ['best-fit', 'strong-fit', 'stretch'] as const
export const FIT_SUMMARY_VERDICTS = ['strong-fit', 'mixed-fit', 'weak-fit'] as const

const optionalMoneySchema = z.number().int().min(0).optional()
const optionalLengthSchema = z.number().min(10).max(120).optional()
const checklistSchema = z.array(z.string().trim().min(1).max(120)).max(8).default([])
const primaryUseDraftSchema = z.enum(PRIMARY_USE_OPTIONS).or(z.literal(''))
const crewSizeDraftSchema = z.enum(CREW_SIZE_OPTIONS).or(z.literal(''))
const experienceLevelDraftSchema = z.enum(EXPERIENCE_LEVEL_OPTIONS).or(z.literal(''))
const maintenanceAppetiteDraftSchema = z.enum(MAINTENANCE_APPETITE_OPTIONS).or(z.literal(''))

export const buyerProfileDraftSchema = z
  .object({
    primaryUse: primaryUseDraftSchema.default(''),
    targetWatersOrRegion: z.string().trim().max(120).default(''),
    budgetMin: optionalMoneySchema,
    budgetMax: optionalMoneySchema,
    lengthMin: optionalLengthSchema,
    lengthMax: optionalLengthSchema,
    crewSize: crewSizeDraftSchema.default(''),
    experienceLevel: experienceLevelDraftSchema.default(''),
    maintenanceAppetite: maintenanceAppetiteDraftSchema.default(''),
    storageOrTowingConstraints: z.string().trim().max(160).default(''),
    mustHaves: checklistSchema,
    dealBreakers: checklistSchema,
  })
  .refine(
    (value) =>
      value.budgetMin == null || value.budgetMax == null || value.budgetMin <= value.budgetMax,
    {
      path: ['budgetMin'],
      message: 'Minimum budget must be less than or equal to maximum budget.',
    },
  )
  .refine(
    (value) =>
      value.lengthMin == null || value.lengthMax == null || value.lengthMin <= value.lengthMax,
    {
      path: ['lengthMin'],
      message: 'Minimum length must be less than or equal to maximum length.',
    },
  )

export const buyerProfileSchema = buyerProfileDraftSchema.superRefine((value, ctx) => {
  const requiredStrings: Array<keyof BuyerProfileDraft> = [
    'primaryUse',
    'targetWatersOrRegion',
    'crewSize',
    'experienceLevel',
    'maintenanceAppetite',
    'storageOrTowingConstraints',
  ]

  for (const key of requiredStrings) {
    if (!value[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'This field is required.',
      })
    }
  }

  if (value.budgetMax == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['budgetMax'],
      message: 'A maximum budget is required.',
    })
  }
})

export const recommendationFiltersSchema = z.object({
  budgetMin: optionalMoneySchema,
  budgetMax: optionalMoneySchema,
  lengthMin: optionalLengthSchema,
  lengthMax: optionalLengthSchema,
  location: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
})

export const recommendationEntrySchema = z.object({
  boatId: z.number().int().positive(),
  rating: z.enum(RECOMMENDATION_RATINGS),
  headline: z.string().trim().min(1).max(120),
  whyItFits: z.string().trim().min(1).max(320),
  tradeoffs: z.string().trim().min(1).max(240),
  score: z.number().int().min(0).max(100),
})

export const recommendationSummarySchema = z.object({
  generatedBy: z.enum(['ai', 'fallback']),
  querySummary: z.string().trim().min(1).max(240),
  overallAdvice: z.string().trim().min(1).max(900),
  topPickBoatId: z.number().int().positive().nullable(),
  recommendations: z.array(recommendationEntrySchema).max(12),
})

export const recommendationSessionSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  profileSnapshot: buyerProfileSchema,
  generatedFilters: recommendationFiltersSchema,
  resultSummary: recommendationSummarySchema,
  rankedBoatIds: z.array(z.number().int().positive()),
})

export const recommendationSessionListItemSchema = recommendationSessionSchema.extend({
  topPickLabel: z.string().trim().max(160).default(''),
})

export const boatFitSummarySchema = z.object({
  generatedBy: z.enum(['ai', 'fallback']),
  verdict: z.enum(FIT_SUMMARY_VERDICTS),
  headline: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  pros: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  cons: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
})

export type BuyerProfileDraft = z.infer<typeof buyerProfileDraftSchema>
export type BuyerProfile = z.infer<typeof buyerProfileSchema>
export type RecommendationFilters = z.infer<typeof recommendationFiltersSchema>
export type RecommendationEntry = z.infer<typeof recommendationEntrySchema>
export type RecommendationSummary = z.infer<typeof recommendationSummarySchema>
export type RecommendationSession = z.infer<typeof recommendationSessionSchema>
export type RecommendationSessionListItem = z.infer<typeof recommendationSessionListItemSchema>
export type BoatFitSummary = z.infer<typeof boatFitSummarySchema>

/** Aligns with server scoring labels in `boatRecommendations.ts` (badge + numeric score). */
export function ratingFromScore(score: number): RecommendationEntry['rating'] {
  if (score >= 82) return 'best-fit'
  if (score >= 68) return 'strong-fit'
  return 'stretch'
}

function normalizeOptionValue<const TValue extends string>(
  value: unknown,
  options: readonly TValue[],
): TValue | '' {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  return options.includes(trimmed as TValue) ? (trimmed as TValue) : ''
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
}

function parseChecklist(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 8)
}

export function createEmptyBuyerProfile(): BuyerProfileDraft {
  return {
    primaryUse: '',
    targetWatersOrRegion: '',
    crewSize: '',
    experienceLevel: '',
    maintenanceAppetite: '',
    storageOrTowingConstraints: '',
    mustHaves: [],
    dealBreakers: [],
  }
}

export const emptyBuyerProfileDraft = createEmptyBuyerProfile

export function normalizeBuyerProfileDraft(input: unknown): BuyerProfileDraft {
  if (!input || typeof input !== 'object') {
    return createEmptyBuyerProfile()
  }

  const raw = input as Record<string, unknown>

  return {
    primaryUse: normalizeOptionValue(raw.primaryUse, PRIMARY_USE_OPTIONS),
    targetWatersOrRegion:
      typeof raw.targetWatersOrRegion === 'string' ? raw.targetWatersOrRegion.trim() : '',
    budgetMin: parseOptionalNumber(raw.budgetMin),
    budgetMax: parseOptionalNumber(raw.budgetMax),
    lengthMin: parseOptionalNumber(raw.lengthMin),
    lengthMax: parseOptionalNumber(raw.lengthMax),
    crewSize: normalizeOptionValue(raw.crewSize, CREW_SIZE_OPTIONS),
    experienceLevel: normalizeOptionValue(raw.experienceLevel, EXPERIENCE_LEVEL_OPTIONS),
    maintenanceAppetite: normalizeOptionValue(
      raw.maintenanceAppetite,
      MAINTENANCE_APPETITE_OPTIONS,
    ),
    storageOrTowingConstraints:
      typeof raw.storageOrTowingConstraints === 'string'
        ? raw.storageOrTowingConstraints.trim()
        : '',
    mustHaves: parseChecklist(raw.mustHaves),
    dealBreakers: parseChecklist(raw.dealBreakers),
  }
}

export function normalizeBuyerProfile(input: unknown): BuyerProfile {
  return buyerProfileSchema.parse(normalizeBuyerProfileDraft(input))
}

export function listToTextarea(items: string[]) {
  return items.join('\n')
}

export function textareaToList(text: string) {
  return text
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}
