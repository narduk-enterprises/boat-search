import { requireAuth } from '#layer/server/utils/auth'
import { getBuyerProfileById } from '~~/server/utils/boatFinderStore'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

  if (Number.isNaN(profileId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
  }

  const result = await getBuyerProfileById(event, user.id, profileId)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  return result
})
