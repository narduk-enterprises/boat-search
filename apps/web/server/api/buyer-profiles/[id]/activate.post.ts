import { defineUserMutation } from '#layer/server/utils/mutation'
import { activateBuyerProfile } from '~~/server/utils/boatFinderStore'

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile-activate', maxRequests: 20, windowMs: 60_000 },
  },
  async ({ event, user }) => {
    const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

    if (Number.isNaN(profileId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
    }

    return activateBuyerProfile(event, user.id, profileId)
  },
)
