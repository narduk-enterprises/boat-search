import type { BoatFitSummary } from '~~/lib/boatFinder'

interface BoatFitSummaryResponse {
  summary: BoatFitSummary
  sessionId: number | null
  cached: boolean
}

export function useBoatFitSummary(
  boatId: MaybeRefOrGetter<number | null | undefined>,
  sessionId?: MaybeRefOrGetter<number | null | undefined>,
) {
  const appFetch = useAppFetch()
  const userSession = useUserSession()
  const boatIdRef = toRef(boatId)
  const sessionIdRef = toRef(sessionId)
  const resolvedBoatId = computed(() => boatIdRef.value ?? null)
  const resolvedSessionId = computed(() => sessionIdRef.value ?? null)

  const { data, status, refresh, error } = useAsyncData(
    () =>
      `boat-fit-summary-${resolvedBoatId.value ?? 'none'}-${resolvedSessionId.value ?? 'latest'}`,
    async () => {
      if (!userSession.loggedIn.value || !resolvedBoatId.value) return null

      return appFetch<BoatFitSummaryResponse>(`/api/boats/${resolvedBoatId.value}/fit-summary`, {
        method: 'POST',
        body: resolvedSessionId.value ? { sessionId: resolvedSessionId.value } : {},
      })
    },
    {
      watch: [() => userSession.loggedIn.value, resolvedBoatId, resolvedSessionId],
    },
  )

  return {
    data,
    summary: computed(() => data.value?.summary ?? null),
    sessionId: computed(() => data.value?.sessionId ?? null),
    cached: computed(() => data.value?.cached ?? false),
    status,
    error,
    refresh,
  }
}
