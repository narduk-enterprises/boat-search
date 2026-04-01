import type {
  BuyerAnswerOverrides,
  RecommendationSession,
  RecommendationSessionListItem,
} from '~~/lib/boatFinder'

interface RecommendationBoat {
  id: number
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: number | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  scrapedAt: string
  updatedAt: string
}

interface RecommendationSessionsResponse {
  latestSessionId: number | null
  sessions: RecommendationSessionListItem[]
}

interface RecommendationSessionDetailResponse {
  session: RecommendationSession
  boats: RecommendationBoat[]
}

interface CreateRecommendationSessionOptions {
  profileId?: number
  overrides?: BuyerAnswerOverrides
  saveOverrides?: boolean
}

interface CreateRecommendationSessionResponse extends RecommendationSessionDetailResponse {
  candidateCount: number
}

export function useRecommendationSessions(
  selectedSessionId?: MaybeRefOrGetter<number | null | undefined>,
) {
  const appFetch = useAppFetch()
  const selectedSessionIdRef = toRef(selectedSessionId)

  const {
    data: sessionsData,
    refresh: refreshSessions,
    status: sessionsStatus,
  } = useFetch<RecommendationSessionsResponse>('/api/recommendation-sessions', {
    key: 'recommendation-sessions',
  })

  const latestSessionId = computed(() => sessionsData.value?.latestSessionId ?? null)
  const resolvedSessionId = computed(() => selectedSessionIdRef.value ?? latestSessionId.value)

  const {
    data: detailData,
    refresh: refreshDetail,
    status: detailStatus,
    error: detailError,
  } = useAsyncData(
    `recommendation-session-${resolvedSessionId.value ?? 'none'}`,
    async () => {
      if (!resolvedSessionId.value) return null
      return appFetch<RecommendationSessionDetailResponse>(
        `/api/recommendation-sessions/${resolvedSessionId.value}`,
      )
    },
    {
      watch: [resolvedSessionId],
    },
  )

  async function createSession(options: CreateRecommendationSessionOptions = {}) {
    const body: Record<string, unknown> = {}
    if (options.profileId) body.profileId = options.profileId
    if (options.overrides) body.overrides = options.overrides
    if (options.saveOverrides != null) body.saveOverrides = options.saveOverrides

    const response = await appFetch<CreateRecommendationSessionResponse>(
      '/api/recommendation-sessions',
      {
        method: 'POST',
        body: Object.keys(body).length > 0 ? body : {},
      },
    )
    await refreshSessions()
    await refreshDetail()
    return response
  }

  return {
    sessionsData,
    sessionsStatus,
    refreshSessions,
    latestSessionId,
    resolvedSessionId,
    currentSession: computed(() => detailData.value?.session ?? null),
    currentBoats: computed(() => detailData.value?.boats ?? []),
    detailStatus,
    detailError,
    refreshDetail,
    createSession,
  }
}
