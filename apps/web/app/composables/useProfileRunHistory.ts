import type { RecommendationSessionListItem } from '~~/lib/boatFinder'

interface SessionsResponse {
  latestSessionId: number | null
  sessions: (RecommendationSessionListItem & { topPickLabel?: string })[]
}

/**
 * Fetches recommendation sessions and filters to those matching the given profileId.
 * Used in the profile editor to show per-profile run history inline.
 */
export function useProfileRunHistory(profileId: MaybeRefOrGetter<number | null | undefined>) {
  const profileIdRef = toRef(profileId)

  const { data, refresh, status } = useFetch<SessionsResponse>('/api/recommendation-sessions', {
    key: 'recommendation-sessions',
  })

  const profileSessions = computed(() => {
    if (!data.value?.sessions || !profileIdRef.value) return []
    return data.value.sessions.filter((s) => s.buyerProfileId === profileIdRef.value)
  })

  const latestProfileSessionId = computed(() => profileSessions.value[0]?.id ?? null)

  return {
    profileSessions,
    latestProfileSessionId,
    status,
    refresh,
  }
}
