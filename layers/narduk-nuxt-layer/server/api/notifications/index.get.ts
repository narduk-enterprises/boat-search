import { getQuery } from 'h3'
import { z } from 'zod'

/**
 * GET /api/notifications
 *
 * Returns the authenticated user's notifications, newest first.
 * Query params: ?unreadOnly=true&limit=20
 */

const querySchema = z.object({
  unreadOnly: z.string().optional(),
  limit: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  const query = parsed.data

  const unreadOnly = query.unreadOnly === 'true'
  const limit = query.limit ? Math.min(Number.parseInt(query.limit, 10), 100) : 50

  const items = await getUserNotifications(event, user.id, { unreadOnly, limit })

  return { notifications: items }
})
