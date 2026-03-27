import { z } from 'zod'
import { boatFavorites, boats } from '~~/server/database/schema'
import { eq } from 'drizzle-orm'
import { defineUserMutation, withValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  boatId: z.coerce.number().int().positive(),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'favorites-add', maxRequests: 60, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body, user }) => {
    const db = useAppDatabase(event)
    const exists = await db.select().from(boats).where(eq(boats.id, body.boatId)).get()
    if (!exists) {
      throw createError({ statusCode: 404, statusMessage: 'Boat not found' })
    }
    const now = new Date().toISOString()
    await db
      .insert(boatFavorites)
      .values({ userId: user.id, boatId: body.boatId, createdAt: now })
      .onConflictDoNothing()
      .run()
    return { ok: true }
  },
)
