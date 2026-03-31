/**
 * Convenience composable that resolves the active buyer profile ID from
 * the profile library. Used by pages that need "the current profile" without
 * requiring the user to pick one explicitly.
 */
export function useActiveBuyerProfile() {
  const { profiles, activeProfileId, status, refresh } = useBuyerProfiles()

  const hasProfiles = computed(() => profiles.value.length > 0)
  const activeProfile = computed(() => profiles.value.find((p) => p.isActive) ?? null)

  return {
    activeProfileId,
    activeProfile,
    hasProfiles,
    status,
    refresh,
  }
}
