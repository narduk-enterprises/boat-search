export function useBuyerProfile() {
  const appFetch = useAppFetch()

  const { data, refresh, status } = useFetch<{
    profile: Record<string, unknown>
    updatedAt?: string
  }>('/api/buyer-profile', { key: 'buyer-profile' })

  async function saveProfile(profile: Record<string, unknown>) {
    await appFetch('/api/buyer-profile', {
      method: 'PUT',
      body: { profile },
    })
    await refresh()
  }

  return { data, status, refresh, saveProfile }
}
