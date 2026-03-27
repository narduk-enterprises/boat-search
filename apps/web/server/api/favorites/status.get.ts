import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { boatFavorites } from '~~/server/database/schema'
import { requireAuth } from '#layer/server/utils/auth'

const querySchema = z.object({
  boatId: z.coerce.number().int().positive(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const q = querySchema.safeParse(getQuery(event))
  if (!q.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid boatId' })
  }
  const db = useAppDatabase(event)
  const row = await db
    .select({ boatId: boatFavorites.boatId })
    .from(boatFavorites)
    .where(and(eq(boatFavorites.userId, user.id), eq(boatFavorites.boatId, q.data.boatId)))
    .get()
  return { favorited: !!row }
})
