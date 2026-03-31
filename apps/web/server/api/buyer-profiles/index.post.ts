import { z } from 'zod'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import {
  createBuyerProfile,
  listBuyerProfiles,
  generateDuplicateName,
} from '~~/server/utils/boatFinderStore'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100).default('New profile'),
  sourceProfileId: z.number().int().positive().optional(),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profiles-create', maxRequests: 10, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    let name = body.name

    // When duplicating, auto-generate the name if user didn't override
    if (body.sourceProfileId && body.name === 'New profile') {
      const { profiles } = await listBuyerProfiles(event, user.id)
      const source = profiles.find((p) => p.id === body.sourceProfileId)
      const existingNames = profiles.map((p) => p.name)
      name = generateDuplicateName(existingNames, source?.name ?? 'Profile')
    }

    return createBuyerProfile(event, user.id, name, body.sourceProfileId)
  },
)
