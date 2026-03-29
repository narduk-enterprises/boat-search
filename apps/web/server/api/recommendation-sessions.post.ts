import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  buildBuyerContext,
  createEmptyBuyerAnswerOverrides,
  createEmptyBuyerProfile,
  isBuyerAnswersComplete,
  mergeBuyerAnswers,
  normalizeBuyerAnswerOverrides,
} from '~~/lib/boatFinder'
import { recommendationSessions } from '~~/server/database/schema'
import {
  buildRecommendationSessionResult,
  getRecommendationSessionForUser,
} from '~~/server/utils/boatRecommendations'
import { getBuyerProfile, upsertBuyerProfile } from '~~/server/utils/boatFinderStore'
import { defineUserMutation, withOptionalValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  overrides: z.unknown().optional(),
  saveOverrides: z.boolean().optional().default(false),
})

export default defineUserMutation(
  {
    rateLimit: { namespace: 'recommendation-sessions', maxRequests: 10, windowMs: 60_000 },
    parseBody: withOptionalValidatedBody(bodySchema.parse, {}),
  },
  async ({ event, body, user }) => {
    const config = useRuntimeConfig(event)
    const db = useAppDatabase(event)
    const storedProfile = await getBuyerProfile(event, user.id)
    const overrides = normalizeBuyerAnswerOverrides(body.overrides)
    const hasOverrides =
      JSON.stringify(overrides) !== JSON.stringify(createEmptyBuyerAnswerOverrides())

    const baseProfile = storedProfile.profile ?? createEmptyBuyerProfile()
    const effectiveAnswers = hasOverrides
      ? mergeBuyerAnswers(baseProfile.coreAnswers, overrides)
      : storedProfile.effectiveAnswers

    if (!isBuyerAnswersComplete(effectiveAnswers)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Complete the guided questionnaire before generating recommendations.',
      })
    }

    const savedProfile = body.saveOverrides
      ? await upsertBuyerProfile(event, user.id, effectiveAnswers)
      : null

    const sessionProfileSnapshot = savedProfile?.profile ?? {
      version: 2 as const,
      coreAnswers: baseProfile.coreAnswers,
      sessionOverrides: hasOverrides ? overrides : createEmptyBuyerAnswerOverrides(),
      normalizedContext: buildBuyerContext(effectiveAnswers),
    }

    const result = await buildRecommendationSessionResult(
      event,
      db,
      sessionProfileSnapshot,
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
