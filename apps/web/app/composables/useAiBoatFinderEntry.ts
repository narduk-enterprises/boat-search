import type { RouteLocationRaw } from 'vue-router'

function guestAiBoatFinderRoute(): RouteLocationRaw {
  return {
    path: '/register',
    query: { redirect: '/ai-boat-finder' },
  }
}

export function useAiBoatFinderEntry() {
  const { loggedIn } = useUserSession()

  const label = computed(() => (loggedIn.value ? 'AI Boat Profiles' : 'AI Boat Finder'))
  const to = computed<RouteLocationRaw>(() =>
    loggedIn.value ? '/account/profile' : guestAiBoatFinderRoute(),
  )

  return {
    label,
    to,
  }
}
