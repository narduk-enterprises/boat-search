import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { buyerProfileSchema } from '~~/lib/boatFinder'
import { recommendationSessions } from '~~/server/database/schema'
import {
  buildRecommendationSessionResult,
  getRecommendationSessionForUser,
} from '~~/server/utils/boatRecommendations'
import { getBuyerProfile, upsertBuyerProfile } from '~~/server/utils/boatFinderStore'
import { defineUserMutation, withOptionalValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  profile: buyerProfileSchema.optional(),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'recommendation-sessions', maxRequests: 10, windowMs: 60_000 },
    parseBody: withOptionalValidatedBody(bodySchema.parse, {}),
  },
  async ({ event, body, user }) => {
    const config = useRuntimeConfig(event)
    const db = useAppDatabase(event)

    let profile = body.profile
    if (profile) {
      await upsertBuyerProfile(event, user.id, profile)
    } else {
      const stored = await getBuyerProfile(event, user.id)
      if (!stored.isComplete) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Complete the guided questionnaire before generating recommendations.',
        })
      }
      profile = buyerProfileSchema.parse(stored.profile)
    }

    const result = await buildRecommendationSessionResult(
      db,
      profile,
      config.xaiApiKey || undefined,
    )

    const createdAt = new Date().toISOString()
    await db.insert(recommendationSessions).values({
      userId: user.id,
      profileSnapshotJson: JSON.stringify(result.profile),
      generatedFilterJson: JSON.stringify(result.filters),
      resultSummaryJson: JSON.stringify(result.summary),
      rankedBoatIdsJson: JSON.stringify(result.rankedBoatIds),
      createdAt,
    })

    const inserted = await db
      .select({ id: recommendationSessions.id })
      .from(recommendationSessions)
      .where(eq(recommendationSessions.userId, user.id))
      .orderBy(desc(recommendationSessions.id))
      .get()

    if (!inserted) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not persist recommendation session',
      })
    }

    const session = await getRecommendationSessionForUser(db, user.id, inserted.id)

    if (!session) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not reload recommendation session',
      })
    }

    return {
      session,
      boats: result.boats,
      candidateCount: result.candidateCount,
    }
  },
)
