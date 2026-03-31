import { z } from 'zod'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { renameBuyerProfile } from '~~/server/utils/boatFinderStore'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile-rename', maxRequests: 20, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

    if (Number.isNaN(profileId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
    }

    return renameBuyerProfile(event, user.id, profileId, body.name)
  },
)
