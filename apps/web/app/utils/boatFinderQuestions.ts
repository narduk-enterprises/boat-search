import {
  BOAT_STYLE_OPTIONS,
  CONDITION_TOLERANCE_OPTIONS,
  CREW_PROFILE_OPTIONS,
  DREAM_VS_PRACTICAL_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  FAMILY_FRICTION_OPTIONS,
  FAMILY_USAGE_OPTIONS,
  MAINTENANCE_REALITY_OPTIONS,
  OVERNIGHT_COMFORT_OPTIONS,
  OWNERSHIP_PRIORITY_OPTIONS,
  OWNERSHIP_STRESSOR_OPTIONS,
  PARTNER_ALIGNMENT_OPTIONS,
  PRIMARY_USE_OPTIONS,
  PROPULSION_PREFERENCE_OPTIONS,
  RANGE_PRIORITY_OPTIONS,
  DEAL_BREAKER_OPTIONS,
  MUST_HAVE_OPTIONS,
  STORAGE_PLAN_OPTIONS,
  TARGET_SPECIES_OPTIONS,
  TARGET_WATERS_OR_REGION_OPTIONS,
  TIME_PRESSURE_OPTIONS,
  TRAVEL_RADIUS_OPTIONS,
  USAGE_CADENCE_OPTIONS,
  type BuyerAnswersDraft,
  type BuyerQuestionId,
} from '~~/lib/boatFinder'

export type BoatFinderSectionId =
  | 'mission'
  | 'guardrails'
  | 'fishing'
  | 'ownership'
  | 'reflective'
  | 'anythingElse'
  | 'review'

export type BoatFinderQuestionKind =
  | 'single_select'
  | 'multi_select'
  | 'number_range'
  | 'short_text_optional'
  | 'long_text_optional'

export interface BoatFinderOption {
  value: string
  label: string
}

interface BoatFinderBaseQuestion {
  id: BuyerQuestionId
  path: string
  section: Exclude<BoatFinderSectionId, 'review'>
  label: string
  description: string
  kind: BoatFinderQuestionKind
  required?: boolean
  allowsSkip?: boolean
  allowsNotSure?: boolean
  contextRole: 'hard' | 'soft' | 'reflective'
  visibleWhen?: (answers: BuyerAnswersDraft) => boolean
}

interface BoatFinderSelectQuestion extends BoatFinderBaseQuestion {
  kind: 'single_select' | 'multi_select'
  options: BoatFinderOption[]
  maxSelections?: number
}

interface BoatFinderNumberRangeQuestion extends BoatFinderBaseQuestion {
  kind: 'number_range'
  minPath: string
  maxPath: string
  minLabel: string
  maxLabel: string
  minPlaceholder?: string
  maxPlaceholder?: string
}

interface BoatFinderTextQuestion extends BoatFinderBaseQuestion {
  kind: 'short_text_optional' | 'long_text_optional'
  placeholder?: string
  helpText?: string
}

export type BoatFinderQuestion =
  | BoatFinderSelectQuestion
  | BoatFinderNumberRangeQuestion
  | BoatFinderTextQuestion

export const BOAT_FINDER_SECTIONS: Array<{
  id: BoatFinderSectionId
  label: string
  description: string
}> = [
  {
    id: 'mission',
    label: 'Mission',
    description: 'How you really plan to use the boat.',
  },
  {
    id: 'guardrails',
    label: 'Guardrails',
    description: 'Budget, size, and logistics that keep the shortlist honest.',
  },
  {
    id: 'fishing',
    label: 'Fishing Fit',
    description: 'Species, layout, and performance preferences.',
  },
  {
    id: 'ownership',
    label: 'Ownership Reality',
    description: 'How much upkeep, comfort, and compromise you can live with.',
  },
  {
    id: 'reflective',
    label: 'Reality Check',
    description: 'Family, time, stress, and the human side of this decision.',
  },
  {
    id: 'anythingElse',
    label: 'Anything else?',
    description:
      'One open box at the end — spill your guts if we missed something that changes everything.',
  },
  {
    id: 'review',
    label: 'Review',
    description: 'Confirm what we heard before generating the shortlist.',
  },
]

function makeOptions(values: readonly string[]): BoatFinderOption[] {
  return values.map((value) => ({ value, label: value }))
}

export interface BoatFinderBudgetPreset {
  id: string
  label: string
  /** Omitted = no floor (anything up to `max`). */
  min?: number
  max: number
}

export const BOAT_FINDER_BUDGET_CUSTOM_ID = 'custom' as const

/** Preset ceilings for the buyer wizard; exact min/max pairs map back to chips. */
export const BOAT_FINDER_BUDGET_PRESETS: readonly BoatFinderBudgetPreset[] = [
  { id: 'to-200k', label: 'Up to $200k', max: 200_000 },
  { id: '200-400', label: '$200k – $400k', min: 200_000, max: 400_000 },
  { id: '400-700', label: '$400k – $700k', min: 400_000, max: 700_000 },
  { id: '700-1200', label: '$700k – $1.2M', min: 700_000, max: 1_200_000 },
  { id: '1_2m-plus', label: '$1.2M+', min: 1_200_000, max: 5_000_000 },
]

export function matchBudgetPreset(min: number | undefined, max: number | undefined): string | null {
  if (max == null) return null
  for (const p of BOAT_FINDER_BUDGET_PRESETS) {
    if (p.max !== max) continue
    const presetMin = p.min
    if (presetMin == null && min == null) return p.id
    if (presetMin != null && presetMin === min) return p.id
  }
  return null
}

export const BOAT_FINDER_QUESTIONS: BoatFinderQuestion[] = [
  {
    id: 'primaryUses',
    path: 'facts.primaryUses',
    section: 'mission',
    label: 'What is this boat really for?',
    description: 'Choose up to three missions so the shortlist stays honest.',
    kind: 'multi_select',
    required: true,
    maxSelections: 3,
    contextRole: 'hard',
    options: makeOptions(PRIMARY_USE_OPTIONS),
  },
  {
    id: 'targetWatersOrRegion',
    path: 'facts.targetWatersOrRegion',
    section: 'mission',
    label: 'Where do you expect to use it most?',
    description:
      'Pick the closest primary region, or skip and lean on travel radius in the next question.',
    kind: 'single_select',
    allowsSkip: true,
    contextRole: 'hard',
    options: makeOptions(TARGET_WATERS_OR_REGION_OPTIONS),
  },
  {
    id: 'travelRadius',
    path: 'facts.travelRadius',
    section: 'mission',
    label: 'How far are you realistically willing to travel for the right boat?',
    description: 'This matters for both shopping and actual use.',
    kind: 'single_select',
    allowsNotSure: true,
    contextRole: 'hard',
    options: makeOptions(TRAVEL_RADIUS_OPTIONS),
  },
  {
    id: 'crewProfile',
    path: 'facts.crewProfile',
    section: 'mission',
    label: 'What crew setup are you buying for?',
    description: 'Choose the setup that will be true most often.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(CREW_PROFILE_OPTIONS),
  },
  {
    id: 'familyUsage',
    path: 'facts.familyUsage',
    section: 'mission',
    label: 'How much family or partner use needs to work too?',
    description: 'Pick up to two if both the fishability and harmony matter.',
    kind: 'multi_select',
    maxSelections: 2,
    allowsSkip: true,
    contextRole: 'reflective',
    options: makeOptions(FAMILY_USAGE_OPTIONS),
  },
  {
    id: 'experienceLevel',
    path: 'facts.experienceLevel',
    section: 'mission',
    label: 'Where are you in the ownership curve?',
    description: 'This helps size the recommendation and maintenance tone.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(EXPERIENCE_LEVEL_OPTIONS),
  },
  {
    id: 'usageCadence',
    path: 'facts.usageCadence',
    section: 'mission',
    label: 'How often does this boat need to get used?',
    description: 'Frequency changes what “worth it” really means.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(USAGE_CADENCE_OPTIONS),
  },
  {
    id: 'budget',
    path: 'facts.budgetMax',
    section: 'guardrails',
    label: 'What budget lane keeps this decision responsible?',
    description: 'Pick a range below, or choose Custom to type your own floor and ceiling.',
    kind: 'number_range',
    required: true,
    contextRole: 'hard',
    minPath: 'facts.budgetMin',
    maxPath: 'facts.budgetMax',
    minLabel: 'Budget floor (optional)',
    maxLabel: 'Budget ceiling',
    minPlaceholder: '100000',
    maxPlaceholder: '450000',
  },
  {
    id: 'length',
    path: 'facts.lengthMax',
    section: 'guardrails',
    label: 'What size band still fits your real life?',
    description: 'Use length only if it is a real guardrail, not a guess.',
    kind: 'number_range',
    allowsSkip: true,
    contextRole: 'hard',
    minPath: 'facts.lengthMin',
    maxPath: 'facts.lengthMax',
    minLabel: 'Minimum length (optional)',
    maxLabel: 'Maximum length (optional)',
    minPlaceholder: '28',
    maxPlaceholder: '45',
  },
  {
    id: 'storagePlan',
    path: 'facts.storagePlan',
    section: 'guardrails',
    label: 'What storage or slip reality does the boat need to fit?',
    description: 'Pick the closest operating constraint.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(STORAGE_PLAN_OPTIONS),
  },
  {
    id: 'targetSpecies',
    path: 'preferences.targetSpecies',
    section: 'fishing',
    label: 'What are the main targets?',
    description: 'Choose up to three species or fisheries that matter most.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 3,
    contextRole: 'soft',
    options: makeOptions(TARGET_SPECIES_OPTIONS),
  },
  {
    id: 'boatStyles',
    path: 'preferences.boatStyles',
    section: 'fishing',
    label: 'What boat styles are actually in play?',
    description: 'Choose up to three if you are flexible.',
    kind: 'multi_select',
    allowsSkip: true,
    allowsNotSure: true,
    maxSelections: 3,
    contextRole: 'soft',
    options: makeOptions(BOAT_STYLE_OPTIONS),
  },
  {
    id: 'ownershipPriorities',
    path: 'preferences.ownershipPriorities',
    section: 'fishing',
    label: 'What matters most when you picture the right boat?',
    description: 'Pick up to four priorities.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 4,
    contextRole: 'soft',
    options: makeOptions(OWNERSHIP_PRIORITY_OPTIONS),
  },
  {
    id: 'mustHaves',
    path: 'preferences.mustHaves',
    section: 'fishing',
    label: 'What are the non-negotiable must-haves?',
    description: 'Tap everything that is truly required — up to eight.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 8,
    contextRole: 'soft',
    options: makeOptions(MUST_HAVE_OPTIONS),
  },
  {
    id: 'dealBreakers',
    path: 'preferences.dealBreakers',
    section: 'ownership',
    label: 'What instantly makes a boat wrong for you?',
    description: 'Tap deal-breakers that should steer the shortlist — up to eight.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 8,
    contextRole: 'soft',
    options: makeOptions(DEAL_BREAKER_OPTIONS),
  },
  {
    id: 'maintenanceReality',
    path: 'preferences.maintenanceReality',
    section: 'ownership',
    label: 'How much maintenance reality can you actually absorb?',
    description: 'Answer for your real calendar and patience, not your best self.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(MAINTENANCE_REALITY_OPTIONS),
  },
  {
    id: 'conditionTolerance',
    path: 'preferences.conditionTolerance',
    section: 'ownership',
    label: 'How much work are you honestly willing to inherit?',
    description: 'The wrong answer here creates expensive regret.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(CONDITION_TOLERANCE_OPTIONS),
  },
  {
    id: 'overnightComfort',
    path: 'preferences.overnightComfort',
    section: 'ownership',
    label: 'How much comfort does the boat need to provide?',
    description: 'This becomes more important when family or longer runs are involved.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(OVERNIGHT_COMFORT_OPTIONS),
    visibleWhen: (answers) =>
      answers.facts.primaryUses.includes('Overnight canyon runs') ||
      answers.facts.familyUsage.length > 0,
  },
  {
    id: 'propulsionPreferences',
    path: 'preferences.propulsionPreferences',
    section: 'ownership',
    label: 'Do you have a propulsion preference that really matters?',
    description: 'Choose up to two if you have a strong lean.',
    kind: 'multi_select',
    allowsSkip: true,
    allowsNotSure: true,
    maxSelections: 2,
    contextRole: 'soft',
    options: makeOptions(PROPULSION_PREFERENCE_OPTIONS),
  },
  {
    id: 'rangePriority',
    path: 'preferences.rangePriority',
    section: 'ownership',
    label: 'How much offshore range matters versus everything else?',
    description: 'Good to answer once you have thought through the real use case.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'soft',
    options: makeOptions(RANGE_PRIORITY_OPTIONS),
    visibleWhen: (answers) => !answers.facts.primaryUses.includes('Bay and inlet fishing'),
  },
  {
    id: 'partnerAlignment',
    path: 'reflectiveAnswers.partnerAlignment',
    section: 'reflective',
    label: 'How aligned is the household on this purchase?',
    description: 'Reality check: the wrong boat can create years of friction.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'reflective',
    options: makeOptions(PARTNER_ALIGNMENT_OPTIONS),
  },
  {
    id: 'timePressure',
    path: 'reflectiveAnswers.timePressure',
    section: 'reflective',
    label: 'How much time pressure are you actually feeling?',
    description: 'Urgency changes how hard we should lean on “good enough” options.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'reflective',
    options: makeOptions(TIME_PRESSURE_OPTIONS),
  },
  {
    id: 'familyFrictionPoints',
    path: 'reflectiveAnswers.familyFrictionPoints',
    section: 'reflective',
    label: 'What would most likely create friction at home?',
    description: 'Pick up to three hard truths.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 3,
    contextRole: 'reflective',
    options: makeOptions(FAMILY_FRICTION_OPTIONS),
  },
  {
    id: 'ownershipStressors',
    path: 'reflectiveAnswers.ownershipStressors',
    section: 'reflective',
    label: 'What kind of ownership stress would wear you down fastest?',
    description: 'Choose up to three if several would poison the experience.',
    kind: 'multi_select',
    allowsSkip: true,
    maxSelections: 3,
    contextRole: 'reflective',
    options: makeOptions(OWNERSHIP_STRESSOR_OPTIONS),
  },
  {
    id: 'dreamVsPractical',
    path: 'reflectiveAnswers.dreamVsPractical',
    section: 'reflective',
    label: 'Is this a dream move, a practical tool, or both?',
    description: 'This helps the advice stay honest instead of performative.',
    kind: 'single_select',
    allowsSkip: true,
    allowsNotSure: true,
    contextRole: 'reflective',
    options: makeOptions(DREAM_VS_PRACTICAL_OPTIONS),
  },
  {
    id: 'openContextNote',
    path: 'openContextNote',
    section: 'anythingElse',
    label: 'Spill your guts — what did we miss?',
    description:
      'Optional. Everything you need us to know that did not fit the buttons above: fears, family dynamics, timing, broker relationships, must-avoid marinas, whatever moves the needle.',
    kind: 'long_text_optional',
    allowsSkip: true,
    contextRole: 'reflective',
    placeholder:
      'Free-form: context, edge cases, and anything that would change the recommendation if we knew it.',
  },
]

export function getVisibleBoatFinderQuestions(
  answers: BuyerAnswersDraft,
  section: Exclude<BoatFinderSectionId, 'review'>,
) {
  return BOAT_FINDER_QUESTIONS.filter(
    (question) =>
      question.section === section && (!question.visibleWhen || question.visibleWhen(answers)),
  )
}

/** Ordered step sections for the wizard (excludes review). */
export const BOAT_FINDER_STEP_SECTION_IDS = BOAT_FINDER_SECTIONS.filter(
  (
    s,
  ): s is (typeof BOAT_FINDER_SECTIONS)[number] & { id: Exclude<BoatFinderSectionId, 'review'> } =>
    s.id !== 'review',
).map((s) => s.id)

export type BoatFinderStepSectionId = (typeof BOAT_FINDER_STEP_SECTION_IDS)[number]

/** Legacy `?step=brief` URLs map to the last wizard section (buyer-brief screen removed). */
export const BOAT_FINDER_BRIEF_STEP_ID = 'brief' as const

export function isBoatFinderStepSectionId(value: string): value is BoatFinderStepSectionId {
  return (BOAT_FINDER_STEP_SECTION_IDS as readonly string[]).includes(value)
}

export function parseBoatFinderStepQuery(value: unknown): BoatFinderStepSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return null
  return isBoatFinderStepSectionId(raw) ? raw : null
}

export function parseBoatFinderWizardStepQuery(value: unknown): BoatFinderStepSectionId | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string' || !raw.trim()) return null
  const s = raw.trim()
  if (s === BOAT_FINDER_BRIEF_STEP_ID) {
    return BOAT_FINDER_STEP_SECTION_IDS.at(-1)!
  }
  return isBoatFinderStepSectionId(s) ? s : null
}

/** 1-based question position in the URL; `null` means “use default” (first incomplete in section). */
export function parseBoatFinderQuestionIndexQuery(
  value: unknown,
  questionCount: number,
): number | null {
  if (questionCount <= 0) return null
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null
  }
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isFinite(n) || n < 1) return null
  const zero = n - 1
  return Math.min(Math.max(0, zero), questionCount - 1)
}

export function firstIncompleteQuestionIndex(
  questions: ReturnType<typeof getVisibleBoatFinderQuestions>,
  draft: BuyerAnswersDraft,
): number {
  if (questions.length === 0) return 0
  const incomplete = questions.findIndex((q) => !boatFinderQuestionHasValue(draft, q))
  if (incomplete >= 0) return incomplete
  return Math.max(0, questions.length - 1)
}

function getValueFromQuestionGroup(
  answers: BuyerAnswersDraft,
  group: 'facts' | 'preferences' | 'reflectiveAnswers',
  key: string,
) {
  if (group === 'facts') {
    return answers.facts[key as keyof BuyerAnswersDraft['facts']]
  }
  if (group === 'preferences') {
    return answers.preferences[key as keyof BuyerAnswersDraft['preferences']]
  }
  return answers.reflectiveAnswers[key as keyof BuyerAnswersDraft['reflectiveAnswers']]
}

/** Whether the user has provided an answer for this question (shared by wizard + summaries). */
export function boatFinderQuestionHasValue(
  answers: BuyerAnswersDraft,
  question: BoatFinderQuestion,
): boolean {
  if (question.kind === 'number_range') {
    const [minGroup, minKey] = question.minPath.split('.')
    const [maxGroup, maxKey] = question.maxPath.split('.')
    if (!minKey || !maxKey) return false
    if (
      (minGroup !== 'facts' && minGroup !== 'preferences' && minGroup !== 'reflectiveAnswers') ||
      (maxGroup !== 'facts' && maxGroup !== 'preferences' && maxGroup !== 'reflectiveAnswers')
    ) {
      return false
    }
    return Boolean(
      getValueFromQuestionGroup(answers, minGroup, minKey) ??
      getValueFromQuestionGroup(answers, maxGroup, maxKey),
    )
  }

  if (question.path === 'openContextNote') {
    return Boolean(answers.openContextNote.trim())
  }

  const [group, key] = question.path.split('.')
  if (!key) return false
  if (group !== 'facts' && group !== 'preferences' && group !== 'reflectiveAnswers') {
    return false
  }

  const value = getValueFromQuestionGroup(answers, group, key)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value != null
}

/** Optional (non-required) visible questions still empty — for “finish later” resume UX. */
export function summarizeOptionalIncomplete(answers: BuyerAnswersDraft): {
  count: number
  firstSectionId: BoatFinderStepSectionId | null
} {
  let count = 0
  let firstSectionId: BoatFinderStepSectionId | null = null

  for (const sectionId of BOAT_FINDER_STEP_SECTION_IDS) {
    const questions = getVisibleBoatFinderQuestions(answers, sectionId)
    for (const q of questions) {
      if (!q.required && !boatFinderQuestionHasValue(answers, q)) {
        count++
        if (!firstSectionId) firstSectionId = sectionId
      }
    }
  }

  return { count, firstSectionId }
}
