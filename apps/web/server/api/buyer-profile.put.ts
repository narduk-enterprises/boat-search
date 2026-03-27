import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { buyerProfiles } from '~~/server/database/schema'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  profile: z.record(z.string(), z.unknown()),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'buyer-profile', maxRequests: 30, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const db = useAppDatabase(event)
    const now = new Date().toISOString()
    const dataJson = JSON.stringify(body.profile)
    const existing = await db
      .select()
      .from(buyerProfiles)
      .where(eq(buyerProfiles.userId, user.id))
      .get()
    if (existing) {
      await db
        .update(buyerProfiles)
        .set({ dataJson, updatedAt: now })
        .where(eq(buyerProfiles.userId, user.id))
        .run()
    } else {
      await db.insert(buyerProfiles).values({ userId: user.id, dataJson, updatedAt: now }).run()
    }
    return { ok: true, updatedAt: now }
  },
)
