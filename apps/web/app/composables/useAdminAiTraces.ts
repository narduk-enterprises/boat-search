import type { RecommendationSummary } from '~~/lib/boatFinder'

export interface AiTraceEntry {
  sessionId: number
  createdAt: string
  userEmail: string
  userName: string | null
  buyerProfileId: number | null
  buyerProfileName: string | null

  attemptedAt: string
  status: 'success' | 'parse-failed' | 'request-failed'
  errorMessage: string | null

  candidateCount: number
  candidateBoatIds: number[]
  relaxedConstraints: string[]
  temperature: number
  maxTokens: number
  reasoningEffort: string

  model: string | null
  selectionSource: string | null
  tokensUsed: number | null
  hasRecommendations: boolean
  recommendationCount: number
  avoidCount: number

  systemPrompt: string
  userPrompt: string
  rawResponse: string
  parsedSummary: RecommendationSummary | null
}

export interface AiTraceStats {
  totalSessions: number
  tracedSessions: number
  successCount: number
  parseFailedCount: number
  requestFailedCount: number
  totalTokensUsed: number
}

interface AiTracesResponse {
  traces: AiTraceEntry[]
  stats: AiTraceStats
}

export function useAdminAiTraces() {
  return useFetch<AiTracesResponse>('/api/admin/ai-traces', {
    key: 'admin-ai-traces',
  })
}
