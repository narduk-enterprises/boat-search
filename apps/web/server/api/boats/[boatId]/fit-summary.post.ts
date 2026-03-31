import { z } from 'zod'
import { defineUserMutation, withOptionalValidatedBody } from '#layer/server/utils/mutation'
import {
  buildBoatFitSummaryResult,
  cacheBoatFitSummary,
  getCachedBoatFitSummary,
  getLatestRecommendationSessionForUser,
  getRecommendationSessionForUser,
} from '~~/server/utils/boatRecommendations'
import { checkDailyRunLimit, getBuyerProfile } from '~~/server/utils/boatFinderStore'

const bodySchema = z.object({
  sessionId: z.number().int().positive().optional(),
  generate: z.boolean().optional().default(false),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'boat-fit-summary', maxRequests: 20, windowMs: 60_000 },
    parseBody: withOptionalValidatedBody(bodySchema.parse, {}),
  },
  async ({ event, body, user }) => {
    const boatId = Number.parseInt(getRouterParam(event, 'boatId') || '', 10)
    if (Number.isNaN(boatId)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid boat id' })
    }

    const db = useAppDatabase(event)
    const storedProfile = await getBuyerProfile(event, user.id)

    const session = body.sessionId
      ? await getRecommendationSessionForUser(db, user.id, body.sessionId)
      : await getLatestRecommendationSessionForUser(db, user.id)

    const profileInput = session?.profileSnapshot ?? storedProfile.profile
    const canScoreWithSavedProfile = storedProfile.isComplete || session != null

    if (!canScoreWithSavedProfile) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Complete the guided questionnaire before requesting fit commentary.',
      })
    }

    const cached = await getCachedBoatFitSummary(db, {
      userId: user.id,
      boatId,
      sessionId: session?.id ?? null,
    })

    if (cached) {
      return { summary: cached, sessionId: session?.id ?? null, cached: true }
    }

    if (!body.generate) {
      return { summary: null, sessionId: session?.id ?? null, cached: false }
    }

    if (!user.isAdmin) {
      const dailyUsage = await checkDailyRunLimit(event, user.id)
      if (!dailyUsage.canRunToday) {
        throw createError({
          statusCode: 429,
          statusMessage: `You've used all ${dailyUsage.dailyRunLimit} AI runs for today. Your limit resets at midnight UTC.`,
          data: {
            dailyRunCount: dailyUsage.dailyRunCount,
            dailyRunLimit: dailyUsage.dailyRunLimit,
          },
        })
      }
    }

    const config = useRuntimeConfig(event)
    const summary = await buildBoatFitSummaryResult(event, db, {
      boatId,
      profileInput,
      session,
      apiKey: config.xaiApiKey || undefined,
    })

    await cacheBoatFitSummary(db, {
      userId: user.id,
      boatId,
      sessionId: session?.id ?? null,
      summary,
    })

    return { summary, sessionId: session?.id ?? null, cached: false }
  },
)
