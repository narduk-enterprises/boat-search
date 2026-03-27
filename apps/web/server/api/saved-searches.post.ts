import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { savedSearches } from '~~/server/database/schema'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { boatSearchFilterSchema } from '~~/server/utils/boatFilterQuery'

const bodySchema = z.object({
  name: z.string().min(1).max(120),
  filter: boatSearchFilterSchema,
  frequency: z.enum(['instant', 'daily', 'weekly']).default('daily'),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'saved-search-create', maxRequests: 20, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const db = useAppDatabase(event)
    const now = new Date().toISOString()
    const filterJson = JSON.stringify(body.filter)
    await db
      .insert(savedSearches)
      .values({
        userId: user.id,
        name: body.name,
        filterJson,
        frequency: body.frequency,
        paused: false,
        lastNotifiedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    const row = await db
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(eq(savedSearches.userId, user.id))
      .orderBy(desc(savedSearches.id))
      .limit(1)
      .get()

    return { id: row?.id }
  },
)
