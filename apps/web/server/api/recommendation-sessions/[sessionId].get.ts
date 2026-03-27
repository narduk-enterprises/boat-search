import { requireAuth } from '#layer/server/utils/auth'
import { getRecommendationSessionForUser } from '~~/server/utils/boatRecommendations'
import { selectBoatsByIds } from '~~/server/utils/boatInventory'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const sessionId = Number.parseInt(getRouterParam(event, 'sessionId') || '', 10)

  if (Number.isNaN(sessionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid recommendation session id' })
  }

  const db = useAppDatabase(event)
  const session = await getRecommendationSessionForUser(db, user.id, sessionId)

  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Recommendation session not found' })
  }

  return {
    session,
    boats: await selectBoatsByIds(db, session.rankedBoatIds),
  }
})
