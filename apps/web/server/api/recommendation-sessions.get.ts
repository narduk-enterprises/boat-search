import { requireAuth } from '#layer/server/utils/auth'
import { getRecommendationSessionsForUser } from '~~/server/utils/boatRecommendations'
import { selectBoatsByIds } from '~~/server/utils/boatInventory'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useAppDatabase(event)
  const sessions = await getRecommendationSessionsForUser(db, user.id)
  const topPickIds = [
    ...new Set(
      sessions
        .map((session) => session.resultSummary.topPickBoatId)
        .filter((boatId): boatId is number => boatId != null),
    ),
  ]
  const topPicks = await selectBoatsByIds(db, topPickIds)
  const topPickMap = new Map(
    topPicks.map((boat) => [
      boat.id,
      `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Unnamed boat',
    ]),
  )

  return {
    latestSessionId: sessions[0]?.id ?? null,
    sessions: sessions.map((session) => ({
      ...session,
      topPickLabel: session.resultSummary.topPickBoatId
        ? (topPickMap.get(session.resultSummary.topPickBoatId) ?? '')
        : '',
    })),
  }
})
