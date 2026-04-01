export function useFavoriteBoat(boatId: MaybeRefOrGetter<number | null | undefined>) {
  const appFetch = useAppFetch()
  const { capture } = usePosthog()
  const session = useUserSession()
  const boatIdRef = toRef(boatId)
  const id = computed(() => boatIdRef.value ?? undefined)

  const { data, refresh } = useAsyncData(
    `favorite-status-${id.value ?? 'none'}`,
    async () => {
      if (!session.loggedIn.value || id.value == null) {
        return { favorited: false as boolean }
      }
      return appFetch<{ favorited: boolean }>(`/api/favorites/status?boatId=${id.value}`)
    },
    {
      watch: [() => session.loggedIn.value, () => id.value],
    },
  )

  const favorited = computed(() => data.value?.favorited ?? false)
  const saving = ref(false)

  async function addFavorite() {
    if (id.value == null) return
    saving.value = true
    try {
      await appFetch('/api/favorites', { method: 'POST', body: { boatId: id.value } })
      capture('favorite_added', { boatId: id.value })
      await refresh()
    } finally {
      saving.value = false
    }
  }

  async function removeFavorite() {
    if (id.value == null) return
    saving.value = true
    try {
      await appFetch(`/api/favorites/${id.value}`, { method: 'DELETE' })
      capture('favorite_removed', { boatId: id.value })
      await refresh()
    } finally {
      saving.value = false
    }
  }

  async function toggleFavorite() {
    if (favorited.value) await removeFavorite()
    else await addFavorite()
  }

  return { favorited, saving, addFavorite, removeFavorite, toggleFavorite, refresh }
}
