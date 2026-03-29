import { z } from 'zod'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { buyerAnswersDraftSchema, normalizeBuyerAnswersDraft } from '~~/lib/boatFinder'
import { upsertBuyerProfile } from '~~/server/utils/boatFinderStore'

const bodySchema = z.object({
  profile: z
    .unknown()
    .transform((value) => buyerAnswersDraftSchema.parse(normalizeBuyerAnswersDraft(value))),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile', maxRequests: 30, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    return upsertBuyerProfile(event, user.id, body.profile)
  },
)
