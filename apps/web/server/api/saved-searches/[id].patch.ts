import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { savedSearches } from '~~/server/database/schema'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { boatSearchFilterSchema } from '~~/server/utils/boatFilterQuery'

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filter: boatSearchFilterSchema.optional(),
  frequency: z.enum(['instant', 'daily', 'weekly']).optional(),
  paused: z.boolean().optional(),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'saved-search-update', maxRequests: 40, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const id = Number.parseInt(getRouterParam(event, 'id') || '', 10)
    if (Number.isNaN(id)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    }
    const db = useAppDatabase(event)
    const row = await db
      .select()
      .from(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
      .get()
    if (!row) {
      throw createError({ statusCode: 404, statusMessage: 'Saved search not found' })
    }
    const now = new Date().toISOString()
    await db
      .update(savedSearches)
      .set({
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.filter != null ? { filterJson: JSON.stringify(body.filter) } : {}),
        ...(body.frequency != null ? { frequency: body.frequency } : {}),
        ...(body.paused != null ? { paused: body.paused } : {}),
        updatedAt: now,
      })
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
      .run()
    return { ok: true }
  },
)
