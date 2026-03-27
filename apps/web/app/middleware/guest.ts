/**
 * Guest-only middleware — same as the layer default, but when a signed-in user hits
 * `/login?redirect=…` we send them to that safe path instead of the global default.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, fetch: refreshSession, clear } = useUserSession()

  try {
    await refreshSession()
  } catch {
    await clear()
  }

  if (loggedIn.value) {
    const r = to.query.redirect
    if (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//')) {
      return navigateTo(r, { replace: true })
    }
    const appConfig = useAppConfig()
    const redirectPath =
      (appConfig as { auth?: { redirectPath?: string } }).auth?.redirectPath ?? '/browse'
    return navigateTo(redirectPath, { replace: true })
  }
})
