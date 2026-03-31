import { requireAuth } from '#layer/server/utils/auth'
import { getBuyerProfileById, checkDailyRunLimit } from '~~/server/utils/boatFinderStore'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const profileId = Number.parseInt(getRouterParam(event, 'id') || '', 10)

  if (Number.isNaN(profileId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid profile id.' })
  }

  const [result, dailyUsage] = await Promise.all([
    getBuyerProfileById(event, user.id, profileId, { isAdmin: !!user.isAdmin }),
    checkDailyRunLimit(event, user.id),
  ])

  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  return {
    ...result,
    // Layer daily run quota on top of per-profile cooldown
    canRunNow: result.canRunNow && (!!user.isAdmin || dailyUsage.canRunToday),
    dailyRunCount: dailyUsage.dailyRunCount,
    dailyRunLimit: dailyUsage.dailyRunLimit,
    runsRemaining: user.isAdmin ? Infinity : dailyUsage.runsRemaining,
  }
})
