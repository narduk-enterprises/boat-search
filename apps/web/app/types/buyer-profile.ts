import type { BuyerAnswersDraft, BuyerProfileDraft } from '~~/lib/boatFinder'

export interface BuyerProfileSummary {
  id: number
  name: string
  isActive: boolean
  isComplete: boolean
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
  canRunNow: boolean
  nextRunAvailableAt: string | null
}

export interface BuyerProfilesResponse {
  profiles: BuyerProfileSummary[]
  activeProfileId: number | null
}

export interface BuyerProfileDetailResponse extends BuyerProfileSummary {
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  latestSessionId: number | null
  dailyRunCount: number
  dailyRunLimit: number
  runsRemaining: number
}
