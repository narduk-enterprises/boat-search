interface BuyerProfileSummary {
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

interface BuyerProfilesResponse {
  profiles: BuyerProfileSummary[]
  activeProfileId: number | null
}

interface CreateProfilePayload {
  name?: string
  sourceProfileId?: number
}

export function useBuyerProfiles() {
  const appFetch = useAppFetch()

  const { data, refresh, status } = useFetch<BuyerProfilesResponse>('/api/buyer-profiles', {
    key: 'buyer-profiles',
  })

  const profiles = computed(() => data.value?.profiles ?? [])
  const activeProfileId = computed(() => data.value?.activeProfileId ?? null)
  const activeProfile = computed(() => profiles.value.find((p) => p.isActive) ?? null)
  const profileCount = computed(() => profiles.value.length)
  const canCreateMore = computed(() => profileCount.value < 5)

  async function createProfile(payload: CreateProfilePayload = {}) {
    const result = await appFetch<BuyerProfileSummary>('/api/buyer-profiles', {
      method: 'POST',
      body: {
        name: payload.name ?? 'New profile',
        sourceProfileId: payload.sourceProfileId,
      },
    })
    await refresh()
    return result
  }

  async function duplicateProfile(sourceProfileId: number) {
    const result = await appFetch<BuyerProfileSummary>('/api/buyer-profiles', {
      method: 'POST',
      body: { sourceProfileId },
    })
    await refresh()
    return result
  }

  async function activateProfile(profileId: number) {
    await appFetch(`/api/buyer-profiles/${profileId}/activate`, {
      method: 'POST',
    })
    await refresh()
  }

  async function deleteProfile(profileId: number) {
    await appFetch(`/api/buyer-profiles/${profileId}`, {
      method: 'DELETE',
    })
    await refresh()
  }

  async function renameProfile(profileId: number, name: string) {
    await appFetch(`/api/buyer-profiles/${profileId}`, {
      method: 'PATCH',
      body: { name },
    })
    await refresh()
  }

  return {
    data,
    status,
    refresh,
    profiles,
    activeProfileId,
    activeProfile,
    profileCount,
    canCreateMore,
    createProfile,
    duplicateProfile,
    activateProfile,
    deleteProfile,
    renameProfile,
  }
}
