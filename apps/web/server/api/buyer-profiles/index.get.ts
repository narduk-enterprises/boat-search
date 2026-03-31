import { requireAuth } from '#layer/server/utils/auth'
import { listBuyerProfiles } from '~~/server/utils/boatFinderStore'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  return listBuyerProfiles(event, user.id)
})
