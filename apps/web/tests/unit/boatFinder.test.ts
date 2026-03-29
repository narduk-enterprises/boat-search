import { describe, expect, it } from 'vitest'
import {
  buildBuyerContext,
  createEmptyBuyerAnswers,
  createEmptyBuyerAnswerOverrides,
  diffBuyerAnswers,
  mergeBuyerAnswers,
  normalizeBuyerProfileDraft,
} from '../../lib/boatFinder'

describe('boat finder profile model', () => {
  it('normalizes legacy flat profiles into the v2 grouped structure', () => {
    const normalized = normalizeBuyerProfileDraft({
      primaryUse: 'Weekend offshore trips',
      targetWatersOrRegion: 'Galveston',
      budgetMax: 350000,
      crewSize: '3-4 anglers',
      experienceLevel: 'Experienced owner-operator',
      maintenanceAppetite: 'Balanced upkeep',
      storageOrTowingConstraints: 'Slip-ready only',
      mustHaves: ['Diesel power'],
      dealBreakers: ['Project boat'],
    })

    expect(normalized.version).toBe(2)
    expect(normalized.coreAnswers.facts.primaryUses).toEqual(['Weekend offshore trips'])
    expect(normalized.coreAnswers.facts.targetWatersOrRegion).toBe('Galveston')
    expect(normalized.coreAnswers.facts.budgetMax).toBe(350000)
    expect(normalized.coreAnswers.facts.crewProfile).toBe('3-4 anglers')
    expect(normalized.coreAnswers.preferences.maintenanceReality).toBe('Balanced upkeep')
    expect(normalized.coreAnswers.facts.storagePlanNotes).toBe('Slip-ready only')
    expect(normalized.coreAnswers.preferences.mustHaves).toEqual(['Diesel power'])
    expect(normalized.coreAnswers.preferences.dealBreakers).toEqual(['Project boat'])
  })

  it('diffs and merges one-off overrides without mutating the base profile', () => {
    const base = createEmptyBuyerAnswers()
    base.facts.primaryUses = ['Weekend offshore trips']
    base.facts.targetWatersOrRegion = 'Galveston'
    base.facts.budgetMax = 350000
    base.preferences.mustHaves = ['Diesel power']

    const next = createEmptyBuyerAnswers()
    next.facts.primaryUses = ['Weekend offshore trips']
    next.facts.targetWatersOrRegion = 'Venice, LA'
    next.facts.budgetMax = 425000
    next.preferences.mustHaves = ['Diesel power', 'Tower visibility']
    next.openContextNote = 'Need this boat to feel worth the time away from family.'

    const overrides = diffBuyerAnswers(base, next)

    expect(overrides.facts.targetWatersOrRegion).toBe('Venice, LA')
    expect(overrides.facts.budgetMax).toBe(425000)
    expect(overrides.preferences.mustHaves).toEqual(['Diesel power', 'Tower visibility'])
    expect(overrides.openContextNote).toContain('worth the time away from family')

    const merged = mergeBuyerAnswers(base, overrides)
    expect(merged.facts.targetWatersOrRegion).toBe('Venice, LA')
    expect(merged.facts.budgetMax).toBe(425000)
    expect(merged.preferences.mustHaves).toEqual(['Diesel power', 'Tower visibility'])
    expect(base.facts.targetWatersOrRegion).toBe('Galveston')
  })

  it('keeps skip and not-sure answers in uncertainties instead of turning them into hard filters', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Offshore tournament fishing']
    answers.facts.budgetMax = 600000
    answers.facts.travelRadius = 'Anywhere on the Gulf'
    answers.questionStates = {
      propulsionPreferences: 'not_sure',
      partnerAlignment: 'skipped',
    }

    const context = buildBuyerContext(answers)

    expect(context.hardConstraints).toContain('Budget ceiling: $600,000')
    expect(context.hardConstraints).toContain('Travel radius: Anywhere on the Gulf')
    expect(context.uncertainties).toContain('Not sure: Propulsion preference')
    expect(context.uncertainties).toContain('Skipped: Partner alignment')
    expect(context.softPreferences).not.toContain('Not sure: Propulsion preference')
  })

  it('creates an empty override object for comparison-safe one-off runs', () => {
    expect(createEmptyBuyerAnswerOverrides()).toEqual({
      facts: {},
      preferences: {},
      reflectiveAnswers: {},
      questionStates: {},
    })
  })

  it('does not let empty override arrays wipe out saved fact selections', () => {
    const base = createEmptyBuyerAnswers()
    base.facts.primaryUses = ['Weekend offshore trips']
    base.facts.familyUsage = ['Equal parts fishing and family time']
    base.facts.targetWatersOrRegion = 'Venice, LA'
    base.facts.budgetMax = 450000

    const merged = mergeBuyerAnswers(base, createEmptyBuyerAnswerOverrides())

    expect(merged.facts.primaryUses).toEqual(['Weekend offshore trips'])
    expect(merged.facts.familyUsage).toEqual(['Equal parts fishing and family time'])
  })
})
