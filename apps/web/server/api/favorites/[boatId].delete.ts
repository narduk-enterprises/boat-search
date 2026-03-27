import { and, eq } from 'drizzle-orm'
import { boatFavorites } from '~~/server/database/schema'
import { defineUserMutation } from '#layer/server/utils/mutation'

export default defineUserMutation(
  {
    rateLimit: { namespace: 'favorites-remove', maxRequests: 60, windowMs: 60_000 },
  },
  async ({ event, user }) => {
    const boatId = Number.parseInt(getRouterParam(event, 'boatId') || '', 10)
    if (Number.isNaN(boatId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid boat id' })
    }
    const db = useAppDatabase(event)
    await db
      .delete(boatFavorites)
      .where(and(eq(boatFavorites.userId, user.id), eq(boatFavorites.boatId, boatId)))
      .run()
    return { ok: true }
  },
)
