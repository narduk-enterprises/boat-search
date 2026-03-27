import { requireAuth } from '#layer/server/utils/auth'
import { getBuyerProfile } from '~~/server/utils/boatFinderStore'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return getBuyerProfile(event, user.id)
})
