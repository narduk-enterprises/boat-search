import type { BuyerProfile, BuyerProfileDraft } from '~~/lib/boatFinder'
import {
  buyerProfileSchema,
  createEmptyBuyerProfile,
  normalizeBuyerProfileDraft,
} from '~~/lib/boatFinder'

interface BuyerProfileResponse {
  profile: BuyerProfileDraft
  updatedAt?: string
  isComplete: boolean
}

export function useBuyerProfile() {
  const appFetch = useAppFetch()

  const { data, refresh, status } = useFetch<BuyerProfileResponse>('/api/buyer-profile', {
    key: 'buyer-profile',
  })

  const profile = computed(() => normalizeBuyerProfileDraft(data.value?.profile))
  const updatedAt = computed(() => data.value?.updatedAt ?? null)
  const isComplete = computed(() => buyerProfileSchema.safeParse(profile.value).success)

  async function saveProfile(nextProfile: BuyerProfile) {
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
    updatedAt,
    isComplete,
    emptyProfile: createEmptyBuyerProfile,
    saveProfile,
  }
}
