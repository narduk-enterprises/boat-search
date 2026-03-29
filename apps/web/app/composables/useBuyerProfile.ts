import type { BuyerAnswers, BuyerAnswersDraft, BuyerProfileDraft } from '~~/lib/boatFinder'
import {
  createEmptyBuyerAnswers,
  createEmptyBuyerProfile,
  getEffectiveBuyerAnswers,
  isBuyerAnswersComplete,
  normalizeBuyerProfileDraft,
} from '~~/lib/boatFinder'

interface BuyerProfileResponse {
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  updatedAt?: string
  isComplete: boolean
}

export function useBuyerProfile() {
  const appFetch = useAppFetch()

  const { data, refresh, status } = useFetch<BuyerProfileResponse>('/api/buyer-profile', {
    key: 'buyer-profile',
  })

  const profile = computed(() => normalizeBuyerProfileDraft(data.value?.profile))
  const coreAnswers = computed(() => profile.value.coreAnswers)
  const effectiveAnswers = computed(
    () => data.value?.effectiveAnswers ?? getEffectiveBuyerAnswers(profile.value),
  )
  const updatedAt = computed(() => data.value?.updatedAt ?? null)
  const isComplete = computed(() => isBuyerAnswersComplete(coreAnswers.value))

  async function saveProfile(nextProfile: BuyerAnswers) {
    await appFetch('/api/buyer-profile', {
      method: 'PUT',
      body: { profile: nextProfile },
    })
    await refresh()
  }

  return {
    data,
    status,
    refresh,
    profile,
    coreAnswers,
    effectiveAnswers,
    updatedAt,
    isComplete,
    emptyProfile: createEmptyBuyerProfile,
    emptyAnswers: createEmptyBuyerAnswers,
    saveProfile,
  }
}
