import { defineUserMutation } from '#layer/server/utils/mutation'
import { deleteBuyerProfile } from '~~/server/utils/boatFinderStore'

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile-delete', maxRequests: 10, windowMs: 60_000 },
  },
  async ({ event, user }) => {
    const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

    if (Number.isNaN(profileId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
    }

    return deleteBuyerProfile(event, user.id, profileId)
  },
)
