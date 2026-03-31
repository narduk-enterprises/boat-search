import { z } from 'zod'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { buyerAnswersDraftSchema, normalizeBuyerAnswersDraft } from '~~/lib/boatFinder'
import { saveBuyerProfile } from '~~/server/utils/boatFinderStore'

const bodySchema = z.object({
  profile: z
    .unknown()
    .transform((value) => buyerAnswersDraftSchema.parse(normalizeBuyerAnswersDraft(value))),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile-save', maxRequests: 30, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

    if (Number.isNaN(profileId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
    }

    return saveBuyerProfile(event, user.id, profileId, body.profile)
  },
)
