import { and, eq } from 'drizzle-orm'
import { savedSearches } from '~~/server/database/schema'
import { defineUserMutation } from '#layer/server/utils/mutation'

export default defineUserMutation(
  {
    rateLimit: { namespace: 'saved-search-delete', maxRequests: 30, windowMs: 60_000 },
  },
  async ({ event, user }) => {
    const id = Number.parseInt(getRouterParam(event, 'id') || '', 10)
    if (Number.isNaN(id)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
    }
    const db = useAppDatabase(event)
    const existing = await db
      .select({ id: savedSearches.id })
      .from(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
      .get()
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Saved search not found' })
    }
    await db
      .delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, user.id)))
      .run()
    return { ok: true }
  },
)
