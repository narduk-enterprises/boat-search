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
  STORAGE_PLAN_OPTIONS,
  TARGET_SPECIES_OPTIONS,
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
  | 'review'

export type BoatFinderQuestionKind =
  | 'single_select'
  | 'multi_select'
  | 'number_range'
  | 'location'
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
  kind: 'location' | 'short_text_optional' | 'long_text_optional'
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
    id: 'review',
    label: 'Review',
    description: 'Confirm what we heard before generating the shortlist.',
  },
]

function makeOptions(values: readonly string[]): BoatFinderOption[] {
  return values.map((value) => ({ value, label: value }))
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
    description: 'Keep it practical: marina, coast, inlet, or general region.',
    kind: 'location',
    contextRole: 'hard',
    placeholder: 'Galveston and the Gulf, Venice, LA, Tampa Bay, etc.',
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
    description: 'Budget max is required. Budget min is optional.',
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
    description: 'One line per must-have. Keep it blunt and specific.',
    kind: 'long_text_optional',
    allowsSkip: true,
    contextRole: 'soft',
    placeholder: 'Diesel power\nTower visibility\nCockpit for tuna gear',
    helpText: 'One item per line.',
  },
  {
    id: 'dealBreakers',
    path: 'preferences.dealBreakers',
    section: 'ownership',
    label: 'What instantly makes a boat wrong for you?',
    description: 'These should stay soft in ranking unless they are explicit hard constraints.',
    kind: 'long_text_optional',
    allowsSkip: true,
    contextRole: 'soft',
    placeholder: 'Gas engines\nProject boat\nToo little family comfort',
    helpText: 'One item per line.',
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
    section: 'reflective',
    label: 'Anything else you need the AI to understand? Lay your heart out if you want.',
    description: 'Optional. This is where nuance, fear, family context, and real priorities belong.',
    kind: 'long_text_optional',
    allowsSkip: true,
    contextRole: 'reflective',
    placeholder:
      'Tell us what really matters, what you are worried about, and what success would feel like.',
  },
]

export function getVisibleBoatFinderQuestions(
  answers: BuyerAnswersDraft,
  section: Exclude<BoatFinderSectionId, 'review'>,
) {
  return BOAT_FINDER_QUESTIONS.filter(
    (question) => question.section === section && (!question.visibleWhen || question.visibleWhen(answers)),
  )
}
