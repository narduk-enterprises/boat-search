import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  buildBuyerContext,
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  createEmptyBuyerProfile,
} from '../../lib/boatFinder'
import { deriveRecommendationFilters, type InventoryBoat } from '../../server/utils/boatInventory'

vi.mock('~~/server/utils/xai', () => ({
  callXAI: vi.fn(),
}))

let buildRecommendationPromptPayload: typeof import('../../server/utils/boatRecommendations').buildRecommendationPromptPayload
let buildFitSummaryPromptPayload: typeof import('../../server/utils/boatRecommendations').buildFitSummaryPromptPayload

function createBoat(id: number, overrides: Partial<InventoryBoat> = {}): InventoryBoat {
  return {
    id,
    listingId: `listing-${id}`,
    source: 'yachtworld',
    url: `https://example.com/boats/${id}`,
    make: 'Contender',
    model: `Mock ${id}`,
    year: 2020,
    length: '39',
    price: 450000,
    currency: 'USD',
    location: 'Orange Beach, AL',
    city: 'Orange Beach',
    state: 'AL',
    country: 'US',
    description: 'Diesel express offshore fishing boat with large cockpit and family seating.',
    contactInfo: null,
    contactName: null,
    contactPhone: null,
    otherDetails: null,
    disclaimer: null,
    features: 'Tower visibility, outriggers, rod holders',
    electricalEquipment: null,
    electronics: 'Radar, chartplotter, autopilot',
    insideEquipment: null,
    outsideEquipment: null,
    additionalEquipment: 'Diesel inboards',
    propulsion: 'Inboard',
    engineMake: 'Caterpillar',
    engineModel: 'C18',
    engineYearDetail: null,
    totalPower: null,
    engineHours: null,
    engineTypeDetail: null,
    driveType: null,
    fuelTypeDetail: 'Diesel',
    propellerType: null,
    propellerMaterial: null,
    specifications: null,
    cruisingSpeed: null,
    maxSpeed: null,
    range: null,
    lengthOverall: null,
    maxBridgeClearance: null,
    maxDraft: null,
    minDraftDetail: null,
    beamDetail: null,
    dryWeight: null,
    windlass: null,
    electricalCircuit: null,
    deadriseAtTransom: null,
    hullMaterial: null,
    hullShape: null,
    keelType: null,
    freshWaterTank: null,
    fuelTank: null,
    holdingTank: null,
    guestHeads: null,
    sellerType: 'Broker',
    listingType: 'Used',
    images: [],
    sourceImages: [],
    scrapedAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  }
}

function extractPromptSection(prompt: string, label: string, nextLabel: string) {
  const pattern = new RegExp(`${label}:\\n([\\s\\S]*?)\\n\\n${nextLabel}:`)
  const match = prompt.match(pattern)

  return match?.[1] ?? ''
}

function buildProfileFromAnswers(answers: ReturnType<typeof createEmptyBuyerAnswers>) {
  const profile = createEmptyBuyerProfile()
  profile.coreAnswers = answers
  profile.normalizedContext = buildBuyerContext(answers)
  return profile
}

describe('boat recommendation prompt packaging', () => {
  beforeAll(async () => {
    const boatRecommendationUtils = await import('../../server/utils/boatRecommendations')
    buildRecommendationPromptPayload = boatRecommendationUtils.buildRecommendationPromptPayload
    buildFitSummaryPromptPayload = boatRecommendationUtils.buildFitSummaryPromptPayload
  })

  it('keeps hard constraints, soft preferences, reflective context, and uncertainties separated', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Mixed-use sandbar and cruising', 'Nearshore family fishing']
    answers.facts.targetWatersOrRegion = 'Northern Gulf (AL / MS / FL panhandle)'
    answers.facts.travelRadius = 'Half-day drive'
    answers.facts.budgetMax = 475000
    answers.facts.familyUsage = ['Needs to win over a spouse or partner too']
    answers.preferences.boatStyles = ['Center console', 'Express']
    answers.preferences.targetSpecies = ['Snapper and grouper']
    answers.preferences.mustHaves = [
      'Easy boarding for family or guests',
      'Strong sun / rain protection on deck',
    ]
    answers.reflectiveAnswers.partnerAlignment = 'Supportive but cautious'
    answers.reflectiveAnswers.familyFrictionPoints = ['Too little comfort for non-anglers']
    answers.reflectiveAnswers.ownershipStressors = ['Owning something the family resents']
    answers.openContextNote =
      'If this turns into a high-maintenance guilt machine, the boat will not survive in our life.'
    answers.questionStates = {
      propulsionPreferences: 'not_sure',
      dreamVsPractical: 'skipped',
    }

    const parsedAnswers = buyerAnswersSchema.parse(answers)
    const profile = buildProfileFromAnswers(parsedAnswers)
    const filters = deriveRecommendationFilters(profile)
    const context = buildBuyerContext(parsedAnswers)
    const payload = buildRecommendationPromptPayload(
      parsedAnswers,
      filters,
      context,
      ['location'],
      [createBoat(101)],
    )

    const hardSection = extractPromptSection(
      payload.userPrompt,
      'Hard constraints',
      'Soft preferences',
    )
    const softSection = extractPromptSection(
      payload.userPrompt,
      'Soft preferences',
      'Reflective context',
    )
    const reflectiveSection = extractPromptSection(
      payload.userPrompt,
      'Reflective context',
      'Uncertainties',
    )
    const uncertaintySection = extractPromptSection(
      payload.userPrompt,
      'Uncertainties',
      'Structured filters applied',
    )

    expect(hardSection).toContain('Budget ceiling: $475,000')
    expect(hardSection).toContain(
      'Target waters: Northern Gulf (AL / MS / FL panhandle)',
    )
    expect(hardSection).not.toContain('Supportive but cautious')
    expect(softSection).toContain('Center console')
    expect(softSection).toContain('Must-have: Easy boarding for family or guests')
    expect(reflectiveSection).toContain('Partner alignment: Supportive but cautious')
    expect(reflectiveSection).toContain(
      'Buyer added context: If this turns into a high-maintenance guilt machine',
    )
    expect(uncertaintySection).toContain('Not sure: Propulsion preference')
    expect(uncertaintySection).toContain('Skipped: Dream vs practical')
    expect(payload.userPrompt).toContain('Relaxed constraints to keep inventory viable')
    expect(payload.systemPrompt).toContain('"boatsToAvoid"')
    expect(payload.systemPrompt).toContain('Use boatsToAvoid for listings that are weak fits')
    expect(payload.scoredCandidates).toHaveLength(1)
  })

  it('caps recommendation prompt candidates at 24 after deterministic scoring', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Offshore tournament fishing']
    answers.facts.targetWatersOrRegion = 'Florida Gulf Coast'
    answers.facts.budgetMax = 900000
    answers.preferences.boatStyles = ['Convertible / sportfish']
    answers.preferences.targetSpecies = ['Billfish']
    answers.preferences.mustHaves = ['Tower or upper station']

    const parsedAnswers = buyerAnswersSchema.parse(answers)
    const profile = buildProfileFromAnswers(parsedAnswers)
    const filters = deriveRecommendationFilters(profile)
    const context = buildBuyerContext(parsedAnswers)
    const candidates = Array.from({ length: 30 }, (_, index) =>
      createBoat(index + 1, {
        model: `Tournament ${index + 1}`,
        description:
          index < 8
            ? 'Tournament-ready offshore convertible with bridge, outriggers, and billfish cockpit.'
            : 'Capable offshore boat with family seating.',
      }),
    )

    const payload = buildRecommendationPromptPayload(
      parsedAnswers,
      filters,
      context,
      [],
      candidates,
    )

    expect(payload.scoredCandidates).toHaveLength(24)
    expect((payload.userPrompt.match(/\[ID:/g) ?? []).length).toBe(24)
  })

  it('keeps reflective answers out of derived filters for uncertain buyers', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Weekend offshore trips']
    answers.facts.targetWatersOrRegion = 'Western Gulf (TX / LA)'
    answers.facts.travelRadius = 'Anywhere on the Gulf'
    answers.facts.budgetMax = 325000
    answers.preferences.targetSpecies = ['Tuna']
    answers.preferences.ownershipPriorities = ['Easy maintenance']
    answers.reflectiveAnswers.partnerAlignment = 'Needs clear justification'
    answers.reflectiveAnswers.dreamVsPractical = 'Need the safest sensible decision'
    answers.openContextNote = 'I am nervous about buying a boat that turns into a second job.'
    answers.questionStates = {
      propulsionPreferences: 'not_sure',
      overnightComfort: 'skipped',
    }

    const parsedAnswers = buyerAnswersSchema.parse(answers)
    const profile = buildProfileFromAnswers(parsedAnswers)
    const filters = deriveRecommendationFilters(profile)

    expect(filters.budgetMax).toBe(325000)
    expect(filters.location).toBe('Western Gulf (TX / LA)')
    expect(filters.keywords).toContain('Weekend offshore trips')
    expect(filters.keywords).toContain('Tuna')
    expect(filters.keywords).not.toContain('Needs clear justification')
    expect(filters.keywords).not.toContain('Need the safest sensible decision')
    expect(filters.keywords.join(' ')).not.toContain('second job')
  })

  it('builds fit-summary prompts with reflective context in tone only, not structured filters', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Nearshore family fishing']
    answers.facts.targetWatersOrRegion = 'Carolinas / Mid-Atlantic'
    answers.facts.budgetMax = 280000
    answers.preferences.boatStyles = ['Center console']
    answers.preferences.ownershipPriorities = ['Family comfort', 'Easy maintenance']
    answers.reflectiveAnswers.partnerAlignment = 'This will create tension if the boat is wrong'
    answers.reflectiveAnswers.ownershipStressors = ['Not using it enough']
    answers.openContextNote = 'This has to feel easy enough that we actually use it.'

    const parsedAnswers = buyerAnswersSchema.parse(answers)
    const profile = buildProfileFromAnswers(parsedAnswers)
    const filters = deriveRecommendationFilters(profile)
    const context = buildBuyerContext(parsedAnswers)
    const payload = buildFitSummaryPromptPayload(
      parsedAnswers,
      filters,
      context,
      createBoat(202, {
        model: 'Family Fisher 202',
        description: 'Center console with fold-down seating and simple maintenance profile.',
      }),
      {
        boatId: 202,
        rating: 'strong-fit',
        headline: 'Family-capable fishing boat',
        whyItFits: 'Balances fishability with comfort and manageable upkeep.',
        tradeoffs: 'It may lack the range for bigger offshore ambitions.',
        score: 79,
      },
    )

    const reflectiveSection = extractPromptSection(
      payload.userPrompt,
      'Reflective context',
      'Structured filters',
    )
    const filterSection = extractPromptSection(payload.userPrompt, 'Structured filters', 'Boat')

    expect(reflectiveSection).toContain('This will create tension if the boat is wrong')
    expect(reflectiveSection).toContain(
      'Buyer added context: This has to feel easy enough that we actually use it.',
    )
    expect(filterSection).toContain('"location": "Carolinas / Mid-Atlantic"')
    expect(filterSection).not.toContain('This will create tension if the boat is wrong')
    expect(payload.userPrompt).toContain('"boatId": 202')
  })
})
