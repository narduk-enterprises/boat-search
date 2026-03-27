export default defineNuxtRouteMiddleware(async () => {
  const { loggedIn, user, fetch: refreshSession, clear } = useUserSession()

  try {
    await refreshSession()
  } catch {
    await clear()
  }

  if (!loggedIn.value) {
    return navigateTo('/login')
  }

  if (!user.value?.isAdmin) {
    return navigateTo('/')
  }
})
