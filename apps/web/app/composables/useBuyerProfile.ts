import type { BuyerAnswersDraft, BuyerProfileDraft } from '~~/lib/boatFinder'
import {
  buildBuyerContext,
  createEmptyBuyerAnswers,
  createEmptyBuyerAnswerOverrides,
  createEmptyBuyerProfile,
  getEffectiveBuyerAnswers,
  isBuyerAnswersComplete,
  normalizeBuyerAnswersDraft,
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
  const isComplete = computed(
    () => data.value?.isComplete ?? isBuyerAnswersComplete(coreAnswers.value),
  )

  async function saveProfile(nextProfile: BuyerAnswersDraft) {
    const normalized = normalizeBuyerAnswersDraft(nextProfile)
    const response = await appFetch<BuyerProfileResponse>('/api/buyer-profile', {
      method: 'PUT',
      body: { profile: normalized },
    })
    data.value = response ?? {
      profile: {
        version: 2,
        coreAnswers: normalized,
        sessionOverrides: createEmptyBuyerAnswerOverrides(),
        normalizedContext: buildBuyerContext(normalized),
      },
      effectiveAnswers: normalized,
      updatedAt: updatedAt.value ?? undefined,
      isComplete: isBuyerAnswersComplete(normalized),
    }
    return response
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
