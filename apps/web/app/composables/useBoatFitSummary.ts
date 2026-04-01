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

  const isGenerating = ref(false)

  const { data, status, refresh, error } = useAsyncData(
    `boat-fit-summary-${resolvedBoatId.value ?? 'none'}-${resolvedSessionId.value ?? 'latest'}`,
    async () => {
      if (!userSession.loggedIn.value || !resolvedBoatId.value) return null

      return appFetch<BoatFitSummaryResponse>(`/api/boats/${resolvedBoatId.value}/fit-summary`, {
        method: 'POST',
        body: resolvedSessionId.value
          ? { sessionId: resolvedSessionId.value, generate: false }
          : { generate: false },
      })
    },
    {
      watch: [() => userSession.loggedIn.value, resolvedBoatId, resolvedSessionId],
    },
  )

  async function generate() {
    if (!resolvedBoatId.value) return null
    isGenerating.value = true
    error.value = undefined
    try {
      const res = await appFetch<BoatFitSummaryResponse>(
        `/api/boats/${resolvedBoatId.value}/fit-summary`,
        {
          method: 'POST',
          body: resolvedSessionId.value
            ? { sessionId: resolvedSessionId.value, generate: true }
            : { generate: true },
        },
      )
      if (data.value && res) {
        data.value = res
      }
      return res
    } catch (err: unknown) {
      error.value = err as import('nuxt/app').NuxtError<unknown>
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  return {
    data,
    summary: computed(() => data.value?.summary ?? null),
    sessionId: computed(() => data.value?.sessionId ?? null),
    cached: computed(() => data.value?.cached ?? false),
    status,
    isGenerating,
    error,
    refresh,
    generate,
  }
}
