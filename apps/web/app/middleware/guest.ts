export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, fetch: refreshSession, clear } = useUserSession()

  try {
    await refreshSession()
  } catch {
    await clear()
  }

  if (loggedIn.value) {
    const appConfig = useAppConfig()
    const redirectPath =
      (appConfig as { auth?: { redirectPath?: string } }).auth?.redirectPath ?? '/ai-boat-finder'
    return navigateTo(redirectPath, { replace: true })
  }
})
