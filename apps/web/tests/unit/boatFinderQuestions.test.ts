import { describe, expect, it } from 'vitest'
import { createEmptyBuyerAnswers } from '../../lib/boatFinder'
import {
  BOAT_FINDER_BRIEF_STEP_ID,
  BOAT_FINDER_QUESTIONS,
  BOAT_FINDER_STEP_SECTION_IDS,
  boatFinderQuestionHasValue,
  matchBudgetPreset,
  parseBoatFinderQuestionIndexQuery,
  parseBoatFinderStepQuery,
  parseBoatFinderWizardStepQuery,
  summarizeOptionalIncomplete,
} from '../../app/utils/boatFinderQuestions'

describe('boatFinderQuestions', () => {
  it('parseBoatFinderStepQuery accepts valid steps', () => {
    expect(parseBoatFinderStepQuery('mission')).toBe('mission')
    expect(parseBoatFinderStepQuery('guardrails')).toBe('guardrails')
    expect(parseBoatFinderStepQuery('anythingElse')).toBe('anythingElse')
    expect(parseBoatFinderStepQuery('')).toBeNull()
    expect(parseBoatFinderStepQuery('nope')).toBeNull()
  })

  it('parseBoatFinderWizardStepQuery maps legacy brief URL to last section', () => {
    expect(parseBoatFinderWizardStepQuery('mission')).toBe('mission')
    expect(parseBoatFinderWizardStepQuery(BOAT_FINDER_BRIEF_STEP_ID)).toBe(
      BOAT_FINDER_STEP_SECTION_IDS.at(-1),
    )
    expect(parseBoatFinderWizardStepQuery('review')).toBeNull()
    expect(parseBoatFinderWizardStepQuery('')).toBeNull()
  })

  it('parseBoatFinderQuestionIndexQuery parses 1-based index and clamps', () => {
    expect(parseBoatFinderQuestionIndexQuery(undefined, 5)).toBeNull()
    expect(parseBoatFinderQuestionIndexQuery('', 5)).toBeNull()
    expect(parseBoatFinderQuestionIndexQuery('1', 5)).toBe(0)
    expect(parseBoatFinderQuestionIndexQuery('3', 5)).toBe(2)
    expect(parseBoatFinderQuestionIndexQuery('99', 5)).toBe(4)
    expect(parseBoatFinderQuestionIndexQuery('0', 5)).toBeNull()
    expect(parseBoatFinderQuestionIndexQuery('nope', 5)).toBeNull()
  })

  it('summarizeOptionalIncomplete counts empty optional questions', () => {
    const answers = createEmptyBuyerAnswers()
    answers.facts.primaryUses = ['Offshore tournament fishing']
    answers.facts.budgetMax = 200_000
    answers.facts.targetWatersOrRegion = 'Western Gulf (TX / LA)'

    const { count, firstSectionId } = summarizeOptionalIncomplete(answers)
    expect(count).toBeGreaterThan(0)
    expect(firstSectionId).toBeTruthy()
  })

  it('matchBudgetPreset maps exact min/max pairs', () => {
    const noFloor = [undefined, 200_000] as const
    expect(matchBudgetPreset(noFloor[0], noFloor[1])).toBe('to-200k')
    expect(matchBudgetPreset(400_000, 700_000)).toBe('400-700')
    expect(matchBudgetPreset(noFloor[0], 350_000)).toBeNull()
    const missingMax = [100_000, undefined] as const
    expect(matchBudgetPreset(missingMax[0], missingMax[1])).toBeNull()
  })

  it('boatFinderQuestionHasValue detects primaryUses', () => {
    const answers = createEmptyBuyerAnswers()
    const q = BOAT_FINDER_QUESTIONS.find((x) => x.id === 'primaryUses')!
    expect(boatFinderQuestionHasValue(answers, q)).toBe(false)
    answers.facts.primaryUses = ['Offshore tournament fishing']
    expect(boatFinderQuestionHasValue(answers, q)).toBe(true)
  })
})
