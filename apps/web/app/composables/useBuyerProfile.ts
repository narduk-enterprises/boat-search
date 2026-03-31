import type { BuyerAnswersDraft, BuyerProfileDraft } from '~~/lib/boatFinder'
import {
  createEmptyBuyerAnswers,
  createEmptyBuyerProfile,
  getEffectiveBuyerAnswers,
  isBuyerAnswersComplete,
  normalizeBuyerAnswersDraft,
  normalizeBuyerProfileDraft,
} from '~~/lib/boatFinder'

interface BuyerProfileDetailResponse {
  id: number
  name: string
  isActive: boolean
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  isComplete: boolean
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
  canRunNow: boolean
  nextRunAvailableAt: string | null
  latestSessionId: number | null
}

interface SaveProfileResponse {
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  updatedAt: string
  isComplete: boolean
}

export function useBuyerProfile(profileId: MaybeRefOrGetter<number | null | undefined>) {
  const appFetch = useAppFetch()
  const profileIdRef = toRef(profileId)

  const { data, refresh, status, error } = useAsyncData(
    () => `buyer-profile-${profileIdRef.value ?? 'none'}`,
    async () => {
      if (!profileIdRef.value) return null
      return appFetch<BuyerProfileDetailResponse>(`/api/buyer-profiles/${profileIdRef.value}`)
    },
    {
      watch: [profileIdRef],
      // Never serve stale cached data when navigating between pages (e.g. Wizard → Summary).
      // Each page mount fetches fresh profile data from the server.
      // eslint-disable-next-line unicorn/no-useless-undefined -- getCachedData must return undefined (not void) to signal "no cached data" to useAsyncData
      getCachedData: () => undefined,
    },
  )

  const profile = computed(() => normalizeBuyerProfileDraft(data.value?.profile))
  const coreAnswers = computed(() => profile.value.coreAnswers)
  const effectiveAnswers = computed(
    () => data.value?.effectiveAnswers ?? getEffectiveBuyerAnswers(profile.value),
  )
  const updatedAt = computed(() => data.value?.updatedAt ?? null)
  const isComplete = computed(
    () => data.value?.isComplete ?? isBuyerAnswersComplete(coreAnswers.value),
  )
  const canRunNow = computed(() => data.value?.canRunNow ?? true)
  const nextRunAvailableAt = computed(() => data.value?.nextRunAvailableAt ?? null)
  const latestSessionId = computed(() => data.value?.latestSessionId ?? null)
  const profileName = computed(() => data.value?.name ?? '')
  const isActive = computed(() => data.value?.isActive ?? false)

  async function saveProfile(nextProfile: BuyerAnswersDraft) {
    if (!profileIdRef.value) return null
    const normalized = normalizeBuyerAnswersDraft(nextProfile)
    const response = await appFetch<SaveProfileResponse>(
      `/api/buyer-profiles/${profileIdRef.value}`,
      {
        method: 'PUT',
        body: { profile: normalized },
      },
    )
    // Optimistically update the local data
    if (data.value && response) {
      data.value = {
        ...data.value,
        profile: response.profile,
        effectiveAnswers: response.effectiveAnswers,
        updatedAt: response.updatedAt,
        isComplete: response.isComplete,
      }
    }
    return response
  }

  async function renameProfile(name: string) {
    if (!profileIdRef.value) return null
    const response = await appFetch<{ id: number; name: string; updatedAt: string }>(
      `/api/buyer-profiles/${profileIdRef.value}`,
      {
        method: 'PATCH',
        body: { name },
      },
    )
    if (data.value && response) {
      data.value = {
        ...data.value,
        name: response.name,
        updatedAt: response.updatedAt,
      }
    }
    return response
  }

  return {
    data,
    status,
    error,
    refresh,
    profile,
    profileName,
    isActive,
    coreAnswers,
    effectiveAnswers,
    updatedAt,
    isComplete,
    canRunNow,
    nextRunAvailableAt,
    latestSessionId,
    emptyProfile: createEmptyBuyerProfile,
    emptyAnswers: createEmptyBuyerAnswers,
    saveProfile,
    renameProfile,
  }
}
