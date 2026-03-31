import { z } from 'zod'

export const PRIMARY_USE_OPTIONS = [
  'Offshore tournament fishing',
  'Weekend offshore trips',
  'Nearshore family fishing',
  'Bay and inlet fishing',
  'Overnight canyon runs',
  'Mixed-use sandbar and cruising',
] as const

export const TRAVEL_RADIUS_OPTIONS = [
  'Within 90 minutes',
  'Half-day drive',
  'Anywhere on the Gulf',
  'Anywhere in the US',
] as const

export const TARGET_WATERS_OR_REGION_OPTIONS = [
  'Western Gulf (TX / LA)',
  'Northern Gulf (AL / MS / FL panhandle)',
  'Florida Gulf Coast',
  'Florida Atlantic (Miami–Jax)',
  'Carolinas / Mid-Atlantic',
  'Northeast',
  'Pacific / West Coast',
  'Great Lakes',
  'Caribbean / Bahamas runs',
  'Inland / lakes and rivers',
] as const

export const MUST_HAVE_OPTIONS = [
  'Twin diesels or strong twin outboards',
  'Tower or upper station',
  'Serious livewell capacity',
  'Large insulated fish boxes',
  'Seakeeping over raw speed',
  'Shallow draft for home waters',
  'Trailerable or easy haul-out',
  'Generator',
  'Air conditioned cabin or helm',
  'Hardtop or full enclosure',
  'Outriggers / tournament rigging',
  'Bow thruster or joystick docking',
  'Easy boarding for family or guests',
  'Strong sun / rain protection on deck',
] as const

export const DEAL_BREAKER_OPTIONS = [
  'Gas-only power',
  'Major refit or project boat',
  'Too small for usual crew',
  'Poor or unknown service history',
  'Draft too deep for home port',
  'Dated electronics only',
  'Single engine only (need twins)',
  'No professional survey allowed',
  'Layout fights how we fish',
  'Too little family or guest comfort',
] as const

export const CREW_PROFILE_OPTIONS = [
  'Solo or duo',
  '3-4 anglers',
  '5-6 anglers',
  'Tournament crew',
  'Family plus guests',
] as const

export const FAMILY_USAGE_OPTIONS = [
  'Primarily hardcore fishing',
  'Mostly fishing with some family comfort',
  'Equal parts fishing and family time',
  'Needs to win over a spouse or partner too',
] as const

export const EXPERIENCE_LEVEL_OPTIONS = [
  'First offshore boat',
  'Moving up from a smaller boat',
  'Experienced owner-operator',
  'Captain-managed program',
] as const

export const USAGE_CADENCE_OPTIONS = [
  'A few special trips each season',
  'At least monthly in season',
  'Every fishable weekend',
  'Heavy tournament calendar',
] as const

export const STORAGE_PLAN_OPTIONS = [
  'Trailerable or easy dry storage',
  'Slip-ready and staying in the water',
  'Lift or covered storage',
  'Open to either if the boat is right',
] as const

export const TARGET_SPECIES_OPTIONS = [
  'Tuna',
  'Billfish',
  'Wahoo',
  'Mahi',
  'Snapper and grouper',
  'Tarpon and cobia',
  'Redfish and trout',
] as const

export const BOAT_STYLE_OPTIONS = [
  'Center console',
  'Express',
  'Convertible / sportfish',
  'Walkaround',
  'Bay boat',
  'Pilot house',
] as const

export const OWNERSHIP_PRIORITY_OPTIONS = [
  'Range and ride',
  'Cockpit fishability',
  'Easy maintenance',
  'Resale confidence',
  'Family comfort',
  'Fuel efficiency',
  'Tournament credibility',
] as const

export const MAINTENANCE_REALITY_OPTIONS = [
  'Low-touch and predictable',
  'Balanced upkeep',
  'Comfortable with major maintenance',
] as const

export const CONDITION_TOLERANCE_OPTIONS = [
  'Turn-key only',
  'Minor punch list is fine',
  'Cosmetic work is okay',
  'Open to a project if value is undeniable',
] as const

export const OVERNIGHT_COMFORT_OPTIONS = [
  'Day trips only',
  'One overnight in a pinch',
  'Comfortable weekend overnights',
  'Needs real cabin comfort',
] as const

export const PROPULSION_PREFERENCE_OPTIONS = [
  'Diesel inboards',
  'Diesel outboards',
  'Gas outboards',
  'No strong preference',
] as const

export const RANGE_PRIORITY_OPTIONS = [
  'Stay close to the inlet',
  'Comfortable medium-range runs',
  'Needs true offshore legs',
  'Range matters less than cockpit and price',
] as const

export const PARTNER_ALIGNMENT_OPTIONS = [
  'Fully aligned and excited',
  'Supportive but cautious',
  'Needs clear justification',
  'This will create tension if the boat is wrong',
] as const

export const TIME_PRESSURE_OPTIONS = [
  'No rush, willing to wait',
  'Would like to buy this season',
  'Need something soon for trips already planned',
  'Feeling real urgency to make a move',
] as const

export const FAMILY_FRICTION_OPTIONS = [
  'Too much money tied up',
  'Too much maintenance time',
  'Too little comfort for non-anglers',
  'Travel distance to use it',
  'Fear it becomes a dock ornament',
] as const

export const OWNERSHIP_STRESSOR_OPTIONS = [
  'Big surprise repair bills',
  'Constant punch lists',
  'Being upside down on resale',
  'Not using it enough',
  'Owning something the family resents',
] as const

export const DREAM_VS_PRACTICAL_OPTIONS = [
  'Mostly a dream boat purchase',
  'Balanced dream and practicality',
  'Mostly a practical fishing tool',
  'Need the safest sensible decision',
] as const

export const BUYER_QUESTION_LABELS = {
  primaryUses: 'Mission',
  targetWatersOrRegion: 'Target waters',
  travelRadius: 'Travel radius',
  crewProfile: 'Crew profile',
  familyUsage: 'Family usage',
  experienceLevel: 'Experience level',
  usageCadence: 'Usage cadence',
  budget: 'Budget',
  length: 'Length',
  storagePlan: 'Storage plan',
  targetSpecies: 'Target species',
  boatStyles: 'Boat style',
  ownershipPriorities: 'Ownership priorities',
  mustHaves: 'Must-haves',
  dealBreakers: 'Deal-breakers',
  maintenanceReality: 'Maintenance reality',
  conditionTolerance: 'Condition tolerance',
  overnightComfort: 'Comfort expectations',
  propulsionPreferences: 'Propulsion preference',
  rangePriority: 'Range priority',
  partnerAlignment: 'Partner alignment',
  timePressure: 'Time pressure',
  familyFrictionPoints: 'Family friction points',
  ownershipStressors: 'Ownership stressors',
  dreamVsPractical: 'Dream vs practical',
  openContextNote: 'Anything else',
} as const

export const RECOMMENDATION_RATINGS = ['best-fit', 'strong-fit', 'stretch'] as const
export const FIT_SUMMARY_VERDICTS = ['strong-fit', 'mixed-fit', 'weak-fit'] as const
export const BUYER_PROFILE_VERSION = 2 as const

export type BuyerQuestionId = keyof typeof BUYER_QUESTION_LABELS

const optionalMoneySchema = z.number().int().min(0).optional()
const optionalLengthSchema = z.number().min(10).max(120).optional()
const optionalShortTextSchema = z.string().trim().max(160).default('')
const optionalLongTextSchema = z.string().trim().max(1200).default('')
const questionStateSchema = z.enum(['answered', 'skipped', 'not_sure'])
export type BuyerQuestionState = z.infer<typeof questionStateSchema>

function enumOrEmpty<const TValue extends readonly [string, ...string[]]>(options: TValue) {
  return z.enum(options).or(z.literal(''))
}

function enumArray<const TValue extends readonly [string, ...string[]]>(
  options: TValue,
  maxSelections: number,
) {
  return z.array(z.enum(options)).max(maxSelections).default([])
}

const buyerFactsBaseSchema = z.object({
  primaryUses: enumArray(PRIMARY_USE_OPTIONS, 3),
  targetWatersOrRegion: enumOrEmpty(TARGET_WATERS_OR_REGION_OPTIONS).default(''),
  travelRadius: enumOrEmpty(TRAVEL_RADIUS_OPTIONS).default(''),
  crewProfile: enumOrEmpty(CREW_PROFILE_OPTIONS).default(''),
  familyUsage: enumArray(FAMILY_USAGE_OPTIONS, 2),
  experienceLevel: enumOrEmpty(EXPERIENCE_LEVEL_OPTIONS).default(''),
  usageCadence: enumOrEmpty(USAGE_CADENCE_OPTIONS).default(''),
  budgetMin: optionalMoneySchema,
  budgetMax: optionalMoneySchema,
  lengthMin: optionalLengthSchema,
  lengthMax: optionalLengthSchema,
  storagePlan: enumOrEmpty(STORAGE_PLAN_OPTIONS).default(''),
  storagePlanNotes: optionalShortTextSchema,
})

const buyerFactsDraftSchema = buyerFactsBaseSchema
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

const buyerPreferencesBaseSchema = z.object({
  targetSpecies: enumArray(TARGET_SPECIES_OPTIONS, 3),
  boatStyles: enumArray(BOAT_STYLE_OPTIONS, 3),
  ownershipPriorities: enumArray(OWNERSHIP_PRIORITY_OPTIONS, 4),
  mustHaves: enumArray(MUST_HAVE_OPTIONS, 8),
  dealBreakers: enumArray(DEAL_BREAKER_OPTIONS, 8),
  maintenanceReality: enumOrEmpty(MAINTENANCE_REALITY_OPTIONS).default(''),
  conditionTolerance: enumOrEmpty(CONDITION_TOLERANCE_OPTIONS).default(''),
  overnightComfort: enumOrEmpty(OVERNIGHT_COMFORT_OPTIONS).default(''),
  propulsionPreferences: enumArray(PROPULSION_PREFERENCE_OPTIONS, 2),
  rangePriority: enumOrEmpty(RANGE_PRIORITY_OPTIONS).default(''),
})

const buyerPreferencesDraftSchema = buyerPreferencesBaseSchema

const buyerReflectiveAnswersBaseSchema = z.object({
  partnerAlignment: enumOrEmpty(PARTNER_ALIGNMENT_OPTIONS).default(''),
  timePressure: enumOrEmpty(TIME_PRESSURE_OPTIONS).default(''),
  familyFrictionPoints: enumArray(FAMILY_FRICTION_OPTIONS, 3),
  ownershipStressors: enumArray(OWNERSHIP_STRESSOR_OPTIONS, 3),
  dreamVsPractical: enumOrEmpty(DREAM_VS_PRACTICAL_OPTIONS).default(''),
})

const buyerReflectiveAnswersDraftSchema = buyerReflectiveAnswersBaseSchema

export const buyerAnswersDraftSchema = z.object({
  facts: buyerFactsDraftSchema,
  preferences: buyerPreferencesDraftSchema,
  reflectiveAnswers: buyerReflectiveAnswersDraftSchema,
  openContextNote: optionalLongTextSchema,
  questionStates: z.record(z.string(), questionStateSchema).default({}),
})

export const buyerAnswersSchema = buyerAnswersDraftSchema.superRefine((value, ctx) => {
  if (value.facts.primaryUses.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['facts', 'primaryUses'],
      message: 'Choose at least one mission for the shortlist.',
    })
  }

  if (value.facts.budgetMax == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['facts', 'budgetMax'],
      message: 'A maximum budget is required.',
    })
  }

  if (!value.facts.targetWatersOrRegion && !value.facts.travelRadius) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['facts', 'targetWatersOrRegion'],
      message: 'Add a geography target or travel radius.',
    })
  }
})

const buyerAnswersOverridesSchema = z.object({
  facts: buyerFactsBaseSchema.partial().default({}),
  preferences: buyerPreferencesBaseSchema.partial().default({}),
  reflectiveAnswers: buyerReflectiveAnswersBaseSchema.partial().default({}),
  openContextNote: z.string().trim().max(1200).optional(),
  questionStates: z.record(z.string(), questionStateSchema).default({}),
})

export const recommendationFiltersSchema = z.object({
  budgetMin: optionalMoneySchema,
  budgetMax: optionalMoneySchema,
  lengthMin: optionalLengthSchema,
  lengthMax: optionalLengthSchema,
  location: z.string().trim().max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
})

export const buyerContextSchema = z.object({
  buyerBrief: z.string().trim().min(1).max(900),
  hardConstraints: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  softPreferences: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  reflectiveContext: z.array(z.string().trim().min(1).max(220)).max(16).default([]),
  uncertainties: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  filterSummary: z.object({
    hardConstraintSummary: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    softPreferenceSummary: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
    reflectiveSummary: z.array(z.string().trim().min(1).max(220)).max(16).default([]),
  }),
})

export const buyerProfileRecordSchema = z.object({
  version: z.literal(BUYER_PROFILE_VERSION).default(BUYER_PROFILE_VERSION),
  coreAnswers: buyerAnswersDraftSchema.default(() => createEmptyBuyerAnswers()),
  sessionOverrides: buyerAnswersOverridesSchema.default(() => createEmptyBuyerAnswerOverrides()),
  normalizedContext: buyerContextSchema.optional(),
})

export const recommendationEntrySchema = z.object({
  boatId: z.number().int().positive(),
  rating: z.enum(RECOMMENDATION_RATINGS),
  headline: z.string().trim().min(1).max(160),
  whyItFits: z.string().trim().min(1).max(720),
  tradeoffs: z.string().trim().min(1).max(420),
  score: z.number().int().min(0).max(100),
})

export const recommendationAvoidEntrySchema = z.object({
  boatId: z.number().int().positive(),
  headline: z.string().trim().min(1).max(160),
  whyToAvoid: z.string().trim().min(1).max(720),
  watchouts: z.array(z.string().trim().min(1).max(200)).min(1).max(4).default([]),
  score: z.number().int().min(0).max(100),
})

const recommendationMetaSchema = z.object({
  resolvedModel: z.string().trim().max(120).nullable().default(null),
  selectionSource: z
    .enum(['admin-override', 'catalog-preferred', 'fallback-model', 'not-used'])
    .default('not-used'),
  contextSummaries: z
    .object({
      hardConstraints: z.array(z.string().trim().min(1).max(160)).default([]),
      softPreferences: z.array(z.string().trim().min(1).max(160)).default([]),
      reflectiveContext: z.array(z.string().trim().min(1).max(220)).default([]),
    })
    .default({
      hardConstraints: [],
      softPreferences: [],
      reflectiveContext: [],
    }),
})

export const recommendationSummarySchema = z.object({
  generatedBy: z.enum(['ai', 'fallback']),
  querySummary: z.string().trim().min(1).max(320),
  overallAdvice: z.string().trim().min(1).max(1800),
  topPickBoatId: z.number().int().positive().nullable(),
  recommendations: z.array(recommendationEntrySchema).max(12),
  boatsToAvoid: z.array(recommendationAvoidEntrySchema).max(6).default([]),
  lifeFitNote: z.string().trim().max(480).default(''),
  meta: recommendationMetaSchema.default({
    resolvedModel: null,
    selectionSource: 'not-used',
    contextSummaries: {
      hardConstraints: [],
      softPreferences: [],
      reflectiveContext: [],
    },
  }),
})

export const recommendationSessionSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  profileSnapshot: buyerProfileRecordSchema,
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
  headline: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(900),
  pros: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  cons: z.array(z.string().trim().min(1).max(160)).min(1).max(4),
  lifeFitNote: z.string().trim().max(320).default(''),
})

export type BuyerAnswersDraft = z.infer<typeof buyerAnswersDraftSchema>
export type BuyerAnswers = z.infer<typeof buyerAnswersSchema>
export type BuyerAnswerOverrides = z.infer<typeof buyerAnswersOverridesSchema>
export type BuyerProfileDraft = z.infer<typeof buyerProfileRecordSchema>
export type BuyerProfile = BuyerProfileDraft
export type BuyerContext = z.infer<typeof buyerContextSchema>
export type RecommendationFilters = z.infer<typeof recommendationFiltersSchema>
export type RecommendationEntry = z.infer<typeof recommendationEntrySchema>
export type RecommendationAvoidEntry = z.infer<typeof recommendationAvoidEntrySchema>
export type RecommendationSummary = z.infer<typeof recommendationSummarySchema>
export type RecommendationSession = z.infer<typeof recommendationSessionSchema>
export type RecommendationSessionListItem = z.infer<typeof recommendationSessionListItemSchema>
export type BoatFitSummary = z.infer<typeof boatFitSummarySchema>

function normalizeOptionValue<const TValue extends string>(
  value: unknown,
  options: readonly TValue[],
): TValue | '' {
  if (typeof value !== 'string') return ''

  const trimmed = value.trim()
  return options.includes(trimmed as TValue) ? (trimmed as TValue) : ''
}

function normalizeOptionList<const TValue extends string>(
  value: unknown,
  options: readonly TValue[],
  maxSelections: number,
) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is TValue => options.includes(item as TValue))
    .slice(0, maxSelections)
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (!Number.isNaN(parsed)) return parsed
  }
}

function normalizeQuestionStates(value: unknown): Record<string, BuyerQuestionState> {
  if (!value || typeof value !== 'object') return {}

  const entries: Array<[string, BuyerQuestionState]> = []

  for (const [key, state] of Object.entries(value as Record<string, unknown>)) {
    if (state === 'answered' || state === 'skipped' || state === 'not_sure') {
      entries.push([key, state])
    }
  }

  return Object.fromEntries(entries)
}

function normalizeLegacyBuyerAnswers(raw: Record<string, unknown>): BuyerAnswersDraft {
  return {
    facts: {
      primaryUses: raw.primaryUse
        ? normalizeOptionList([raw.primaryUse], PRIMARY_USE_OPTIONS, 3)
        : [],
      targetWatersOrRegion: normalizeOptionValue(
        raw.targetWatersOrRegion,
        TARGET_WATERS_OR_REGION_OPTIONS,
      ),
      travelRadius: '',
      crewProfile: normalizeOptionValue(raw.crewSize, CREW_PROFILE_OPTIONS),
      familyUsage: [],
      experienceLevel: normalizeOptionValue(raw.experienceLevel, EXPERIENCE_LEVEL_OPTIONS),
      usageCadence: '',
      budgetMin: parseOptionalNumber(raw.budgetMin),
      budgetMax: parseOptionalNumber(raw.budgetMax),
      lengthMin: parseOptionalNumber(raw.lengthMin),
      lengthMax: parseOptionalNumber(raw.lengthMax),
      storagePlan: '',
      storagePlanNotes:
        typeof raw.storageOrTowingConstraints === 'string'
          ? raw.storageOrTowingConstraints.trim()
          : '',
    },
    preferences: {
      targetSpecies: [],
      boatStyles: [],
      ownershipPriorities: [],
      mustHaves: normalizeOptionList(raw.mustHaves, MUST_HAVE_OPTIONS, 8),
      dealBreakers: normalizeOptionList(raw.dealBreakers, DEAL_BREAKER_OPTIONS, 8),
      maintenanceReality: normalizeOptionValue(
        raw.maintenanceAppetite,
        MAINTENANCE_REALITY_OPTIONS,
      ),
      conditionTolerance: '',
      overnightComfort: '',
      propulsionPreferences: [],
      rangePriority: '',
    },
    reflectiveAnswers: {
      partnerAlignment: '',
      timePressure: '',
      familyFrictionPoints: [],
      ownershipStressors: [],
      dreamVsPractical: '',
    },
    openContextNote: '',
    questionStates: {},
  }
}

export function createEmptyBuyerAnswers(): BuyerAnswersDraft {
  return {
    facts: {
      primaryUses: [],
      targetWatersOrRegion: '',
      travelRadius: '',
      crewProfile: '',
      familyUsage: [],
      experienceLevel: '',
      usageCadence: '',
      budgetMin: undefined,
      budgetMax: undefined,
      lengthMin: undefined,
      lengthMax: undefined,
      storagePlan: '',
      storagePlanNotes: '',
    },
    preferences: {
      targetSpecies: [],
      boatStyles: [],
      ownershipPriorities: [],
      mustHaves: [],
      dealBreakers: [],
      maintenanceReality: '',
      conditionTolerance: '',
      overnightComfort: '',
      propulsionPreferences: [],
      rangePriority: '',
    },
    reflectiveAnswers: {
      partnerAlignment: '',
      timePressure: '',
      familyFrictionPoints: [],
      ownershipStressors: [],
      dreamVsPractical: '',
    },
    openContextNote: '',
    questionStates: {},
  }
}

export function createEmptyBuyerAnswerOverrides(): BuyerAnswerOverrides {
  return {
    facts: {},
    preferences: {},
    reflectiveAnswers: {},
    questionStates: {},
  }
}

export function createEmptyBuyerProfile(): BuyerProfileDraft {
  return {
    version: BUYER_PROFILE_VERSION,
    coreAnswers: createEmptyBuyerAnswers(),
    sessionOverrides: createEmptyBuyerAnswerOverrides(),
    normalizedContext: undefined,
  }
}

export const emptyBuyerProfileDraft = createEmptyBuyerProfile

export function normalizeBuyerAnswersDraft(input: unknown): BuyerAnswersDraft {
  if (!input || typeof input !== 'object') {
    return createEmptyBuyerAnswers()
  }

  const raw = input as Record<string, unknown>

  if ('facts' in raw || 'preferences' in raw || 'reflectiveAnswers' in raw) {
    const facts = (raw.facts as Record<string, unknown> | undefined) ?? {}
    const preferences = (raw.preferences as Record<string, unknown> | undefined) ?? {}
    const reflectiveAnswers = (raw.reflectiveAnswers as Record<string, unknown> | undefined) ?? {}

    return {
      facts: {
        primaryUses: normalizeOptionList(facts.primaryUses, PRIMARY_USE_OPTIONS, 3),
        targetWatersOrRegion: normalizeOptionValue(
          facts.targetWatersOrRegion,
          TARGET_WATERS_OR_REGION_OPTIONS,
        ),
        travelRadius: normalizeOptionValue(facts.travelRadius, TRAVEL_RADIUS_OPTIONS),
        crewProfile: normalizeOptionValue(facts.crewProfile, CREW_PROFILE_OPTIONS),
        familyUsage: normalizeOptionList(facts.familyUsage, FAMILY_USAGE_OPTIONS, 2),
        experienceLevel: normalizeOptionValue(facts.experienceLevel, EXPERIENCE_LEVEL_OPTIONS),
        usageCadence: normalizeOptionValue(facts.usageCadence, USAGE_CADENCE_OPTIONS),
        budgetMin: parseOptionalNumber(facts.budgetMin),
        budgetMax: parseOptionalNumber(facts.budgetMax),
        lengthMin: parseOptionalNumber(facts.lengthMin),
        lengthMax: parseOptionalNumber(facts.lengthMax),
        storagePlan: normalizeOptionValue(facts.storagePlan, STORAGE_PLAN_OPTIONS),
        storagePlanNotes:
          typeof facts.storagePlanNotes === 'string' ? facts.storagePlanNotes.trim() : '',
      },
      preferences: {
        targetSpecies: normalizeOptionList(preferences.targetSpecies, TARGET_SPECIES_OPTIONS, 3),
        boatStyles: normalizeOptionList(preferences.boatStyles, BOAT_STYLE_OPTIONS, 3),
        ownershipPriorities: normalizeOptionList(
          preferences.ownershipPriorities,
          OWNERSHIP_PRIORITY_OPTIONS,
          4,
        ),
        mustHaves: normalizeOptionList(preferences.mustHaves, MUST_HAVE_OPTIONS, 8),
        dealBreakers: normalizeOptionList(preferences.dealBreakers, DEAL_BREAKER_OPTIONS, 8),
        maintenanceReality: normalizeOptionValue(
          preferences.maintenanceReality,
          MAINTENANCE_REALITY_OPTIONS,
        ),
        conditionTolerance: normalizeOptionValue(
          preferences.conditionTolerance,
          CONDITION_TOLERANCE_OPTIONS,
        ),
        overnightComfort: normalizeOptionValue(
          preferences.overnightComfort,
          OVERNIGHT_COMFORT_OPTIONS,
        ),
        propulsionPreferences: normalizeOptionList(
          preferences.propulsionPreferences,
          PROPULSION_PREFERENCE_OPTIONS,
          2,
        ),
        rangePriority: normalizeOptionValue(preferences.rangePriority, RANGE_PRIORITY_OPTIONS),
      },
      reflectiveAnswers: {
        partnerAlignment: normalizeOptionValue(
          reflectiveAnswers.partnerAlignment,
          PARTNER_ALIGNMENT_OPTIONS,
        ),
        timePressure: normalizeOptionValue(reflectiveAnswers.timePressure, TIME_PRESSURE_OPTIONS),
        familyFrictionPoints: normalizeOptionList(
          reflectiveAnswers.familyFrictionPoints,
          FAMILY_FRICTION_OPTIONS,
          3,
        ),
        ownershipStressors: normalizeOptionList(
          reflectiveAnswers.ownershipStressors,
          OWNERSHIP_STRESSOR_OPTIONS,
          3,
        ),
        dreamVsPractical: normalizeOptionValue(
          reflectiveAnswers.dreamVsPractical,
          DREAM_VS_PRACTICAL_OPTIONS,
        ),
      },
      openContextNote: typeof raw.openContextNote === 'string' ? raw.openContextNote.trim() : '',
      questionStates: normalizeQuestionStates(raw.questionStates),
    }
  }

  return normalizeLegacyBuyerAnswers(raw)
}

export function normalizeBuyerProfileDraft(input: unknown): BuyerProfileDraft {
  if (!input || typeof input !== 'object') {
    return createEmptyBuyerProfile()
  }

  const raw = input as Record<string, unknown>

  if ('version' in raw || 'coreAnswers' in raw || 'sessionOverrides' in raw) {
    const coreAnswers = normalizeBuyerAnswersDraft(raw.coreAnswers)
    const sessionOverrides = normalizeBuyerAnswerOverrides(raw.sessionOverrides)
    return {
      version: BUYER_PROFILE_VERSION,
      coreAnswers,
      sessionOverrides,
      normalizedContext:
        raw.normalizedContext && typeof raw.normalizedContext === 'object'
          ? buyerContextSchema.safeParse(raw.normalizedContext).data
          : undefined,
    }
  }

  return {
    version: BUYER_PROFILE_VERSION,
    coreAnswers: normalizeLegacyBuyerAnswers(raw),
    sessionOverrides: createEmptyBuyerAnswerOverrides(),
    normalizedContext: undefined,
  }
}

export function normalizeBuyerAnswerOverrides(input: unknown): BuyerAnswerOverrides {
  if (!input || typeof input !== 'object') {
    return createEmptyBuyerAnswerOverrides()
  }

  const raw = input as Record<string, unknown>
  const normalized = normalizeBuyerAnswersDraft(raw)

  return {
    facts: Object.fromEntries(
      Object.entries(normalized.facts).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0
        return value !== '' && value != null
      }),
    ),
    preferences: Object.fromEntries(
      Object.entries(normalized.preferences).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0
        return value !== '' && value != null
      }),
    ),
    reflectiveAnswers: Object.fromEntries(
      Object.entries(normalized.reflectiveAnswers).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0
        return value !== '' && value != null
      }),
    ),
    openContextNote: normalized.openContextNote || undefined,
    questionStates: normalized.questionStates,
  }
}

export function mergeBuyerAnswers(
  coreAnswers: BuyerAnswersDraft,
  overrides?: BuyerAnswerOverrides | null,
): BuyerAnswersDraft {
  const normalizedCore = normalizeBuyerAnswersDraft(coreAnswers)
  const normalizedOverrides = normalizeBuyerAnswerOverrides(overrides)

  return {
    facts: {
      ...normalizedCore.facts,
      ...normalizedOverrides.facts,
    },
    preferences: {
      ...normalizedCore.preferences,
      ...normalizedOverrides.preferences,
    },
    reflectiveAnswers: {
      ...normalizedCore.reflectiveAnswers,
      ...normalizedOverrides.reflectiveAnswers,
    },
    openContextNote: normalizedOverrides.openContextNote ?? normalizedCore.openContextNote,
    questionStates: {
      ...normalizedCore.questionStates,
      ...normalizedOverrides.questionStates,
    },
  }
}

function diffGroup<T extends Record<string, unknown>>(base: T, next: T) {
  return Object.fromEntries(
    Object.entries(next).flatMap(([key, value]) => {
      const baseValue = base[key]
      if (JSON.stringify(baseValue) === JSON.stringify(value)) return []
      return [[key, value]]
    }),
  ) as Partial<T>
}

function diffQuestionStates(
  base: Record<string, BuyerQuestionState>,
  next: Record<string, BuyerQuestionState>,
) {
  return Object.fromEntries(
    Object.entries(next).flatMap(([key, value]) => {
      if (base[key] === value) return []
      return [[key, value]]
    }),
  ) as Record<string, BuyerQuestionState>
}

export function diffBuyerAnswers(
  base: BuyerAnswersDraft,
  next: BuyerAnswersDraft,
): BuyerAnswerOverrides {
  const normalizedBase = normalizeBuyerAnswersDraft(base)
  const normalizedNext = normalizeBuyerAnswersDraft(next)

  return {
    facts: diffGroup(normalizedBase.facts, normalizedNext.facts),
    preferences: diffGroup(normalizedBase.preferences, normalizedNext.preferences),
    reflectiveAnswers: diffGroup(
      normalizedBase.reflectiveAnswers,
      normalizedNext.reflectiveAnswers,
    ),
    openContextNote:
      normalizedBase.openContextNote === normalizedNext.openContextNote
        ? undefined
        : normalizedNext.openContextNote,
    questionStates: diffQuestionStates(
      normalizedBase.questionStates,
      normalizedNext.questionStates,
    ),
  }
}

export function getEffectiveBuyerAnswers(profile: unknown): BuyerAnswersDraft {
  const normalized = normalizeBuyerProfileDraft(profile)
  return mergeBuyerAnswers(normalized.coreAnswers, normalized.sessionOverrides)
}

export function isBuyerAnswersComplete(input: unknown) {
  return buyerAnswersSchema.safeParse(normalizeBuyerAnswersDraft(input)).success
}

export function buildBuyerContext(input: unknown): BuyerContext {
  const answers = normalizeBuyerAnswersDraft(input)
  const hardConstraints: string[] = []
  const softPreferences: string[] = []
  const reflectiveContext: string[] = []

  if (answers.facts.budgetMax != null) {
    hardConstraints.push(`Budget ceiling: $${answers.facts.budgetMax.toLocaleString()}`)
  }
  if (answers.facts.budgetMin != null) {
    hardConstraints.push(`Budget floor: $${answers.facts.budgetMin.toLocaleString()}`)
  }

  if (answers.facts.lengthMin != null || answers.facts.lengthMax != null) {
    const min = answers.facts.lengthMin ?? '?'
    const max = answers.facts.lengthMax ?? '?'
    hardConstraints.push(`Target size band: ${min}-${max} ft`)
  }

  if (answers.facts.targetWatersOrRegion) {
    hardConstraints.push(`Target waters: ${answers.facts.targetWatersOrRegion}`)
  }
  if (answers.facts.travelRadius) {
    hardConstraints.push(`Travel radius: ${answers.facts.travelRadius}`)
  }

  const directSoftSignals = [
    ...answers.facts.primaryUses,
    answers.facts.crewProfile,
    ...answers.facts.familyUsage,
    answers.facts.experienceLevel,
    answers.facts.usageCadence,
    answers.facts.storagePlan,
    answers.facts.storagePlanNotes,
    ...answers.preferences.targetSpecies,
    ...answers.preferences.boatStyles,
    ...answers.preferences.ownershipPriorities,
    answers.preferences.maintenanceReality,
    answers.preferences.conditionTolerance,
    answers.preferences.overnightComfort,
    ...answers.preferences.propulsionPreferences,
    answers.preferences.rangePriority,
    ...answers.preferences.mustHaves.map((item) => `Must-have: ${item}`),
    ...answers.preferences.dealBreakers.map((item) => `Deal-breaker: ${item}`),
  ]

  for (const signal of directSoftSignals) {
    if (signal) {
      softPreferences.push(signal)
    }
  }

  const reflectiveSignals = [
    answers.reflectiveAnswers.partnerAlignment &&
      `Partner alignment: ${answers.reflectiveAnswers.partnerAlignment}`,
    answers.reflectiveAnswers.timePressure &&
      `Time pressure: ${answers.reflectiveAnswers.timePressure}`,
    ...answers.reflectiveAnswers.familyFrictionPoints.map((item) => `Family friction: ${item}`),
    ...answers.reflectiveAnswers.ownershipStressors.map((item) => `Ownership stressor: ${item}`),
    answers.reflectiveAnswers.dreamVsPractical &&
      `Purchase mindset: ${answers.reflectiveAnswers.dreamVsPractical}`,
    answers.openContextNote && `Buyer added context: ${answers.openContextNote}`,
  ]

  for (const signal of reflectiveSignals) {
    if (signal) {
      reflectiveContext.push(signal)
    }
  }

  const uncertainties = Object.entries(answers.questionStates).flatMap(([key, state]) => {
    if (state === 'skipped') {
      return [`Skipped: ${BUYER_QUESTION_LABELS[key as BuyerQuestionId] ?? key}`]
    }
    if (state === 'not_sure') {
      return [`Not sure: ${BUYER_QUESTION_LABELS[key as BuyerQuestionId] ?? key}`]
    }
    return []
  })

  const missionSummary = answers.facts.primaryUses.join(', ') || 'a better fishing-boat fit'
  const locationSummary =
    answers.facts.targetWatersOrRegion || answers.facts.travelRadius || 'a practical search radius'
  const budgetSummary =
    answers.facts.budgetMax != null
      ? `up to $${answers.facts.budgetMax.toLocaleString()}`
      : 'without a fixed budget ceiling'
  const lifeFitSummary =
    answers.reflectiveAnswers.partnerAlignment || answers.reflectiveAnswers.dreamVsPractical
      ? `The household reality is ${[
          answers.reflectiveAnswers.partnerAlignment,
          answers.reflectiveAnswers.dreamVsPractical,
        ]
          .filter(Boolean)
          .join(' and ')
          .toLowerCase()}.`
      : ''

  const buyerBrief = [
    `Buyer wants ${missionSummary.toLowerCase()} in ${locationSummary} with a budget ${budgetSummary}.`,
    answers.preferences.boatStyles.length
      ? `Preferred hull styles: ${answers.preferences.boatStyles.join(', ')}.`
      : '',
    answers.preferences.ownershipPriorities.length
      ? `Top priorities: ${answers.preferences.ownershipPriorities.join(', ')}.`
      : '',
    lifeFitSummary,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 900)

  return buyerContextSchema.parse({
    buyerBrief,
    hardConstraints,
    softPreferences,
    reflectiveContext,
    uncertainties,
    filterSummary: {
      hardConstraintSummary: hardConstraints,
      softPreferenceSummary: softPreferences.slice(0, 8),
      reflectiveSummary: reflectiveContext.slice(0, 6),
    },
  })
}

/**
 * Numeric/keyword filters we pass with the buyer context to ranking + shortlist AI prompts
 * (`Structured filters applied` in `boatRecommendations.ts`). Kept in lib so the client can
 * preview the same object without importing server inventory code.
 */
export function deriveRecommendationFiltersFromAnswers(
  answers: BuyerAnswersDraft,
): RecommendationFilters {
  const normalized = normalizeBuyerAnswersDraft(answers)
  const context = buildBuyerContext(normalized)
  const keywordPool = [
    ...normalized.facts.primaryUses,
    ...normalized.preferences.targetSpecies,
    ...normalized.preferences.boatStyles,
    ...normalized.preferences.ownershipPriorities,
    ...normalized.preferences.mustHaves,
  ]

  return {
    budgetMin: normalized.facts.budgetMin,
    budgetMax: normalized.facts.budgetMax,
    lengthMin: normalized.facts.lengthMin,
    lengthMax: normalized.facts.lengthMax,
    location: normalized.facts.targetWatersOrRegion || undefined,
    keywords: [...new Set(keywordPool.map((item) => item.trim()).filter(Boolean))]
      .concat(context.softPreferences.slice(0, 4))
      .slice(0, 20),
  }
}

export function normalizeBuyerProfile(input: unknown): BuyerProfile {
  const normalized = normalizeBuyerProfileDraft(input)
  return {
    ...normalized,
    normalizedContext:
      normalized.normalizedContext ?? buildBuyerContext(getEffectiveBuyerAnswers(normalized)),
  }
}

/** Aligns with server scoring labels in `boatRecommendations.ts` (badge + numeric score). */
export function ratingFromScore(score: number): RecommendationEntry['rating'] {
  if (score >= 82) return 'best-fit'
  if (score >= 68) return 'strong-fit'
  return 'stretch'
}
