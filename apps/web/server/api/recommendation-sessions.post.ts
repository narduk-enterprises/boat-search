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
import {
  getActiveBuyerProfile,
  getBuyerProfileById,
  checkProfileRunCooldown,
  markBuyerProfileRunSuccess,
  saveBuyerProfile,
} from '~~/server/utils/boatFinderStore'
import { defineUserMutation, withOptionalValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  profileId: z.number().int().positive().optional(),
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

    // Resolve profile — by explicit ID, or fall back to active profile
    let profileData: Awaited<ReturnType<typeof getBuyerProfileById>> = null
    let resolvedProfileId: number | null = null

    if (body.profileId) {
      profileData = await getBuyerProfileById(event, user.id, body.profileId)
      if (!profileData) {
        throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
      }
      resolvedProfileId = profileData.id
    } else {
      const active = await getActiveBuyerProfile(event, user.id)
      if (active) {
        profileData = await getBuyerProfileById(event, user.id, active.id)
        resolvedProfileId = active.id
      }
    }

    // Enforce cooldown if we have a resolved profile
    if (resolvedProfileId && profileData) {
      const cooldown = checkProfileRunCooldown(profileData.lastRunAt)
      if (!cooldown.canRunNow) {
        throw createError({
          statusCode: 429,
          statusMessage: 'This profile was run recently. Try again later.',
          data: { nextRunAvailableAt: cooldown.nextRunAvailableAt },
        })
      }
    }

    const overrides = normalizeBuyerAnswerOverrides(body.overrides)
    const hasOverrides =
      JSON.stringify(overrides) !== JSON.stringify(createEmptyBuyerAnswerOverrides())

    const baseProfile = profileData?.profile ?? createEmptyBuyerProfile()
    const effectiveAnswers = hasOverrides
      ? mergeBuyerAnswers(baseProfile.coreAnswers, overrides)
      : profileData?.effectiveAnswers ?? baseProfile.coreAnswers

    if (!isBuyerAnswersComplete(effectiveAnswers)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Complete the guided questionnaire before generating recommendations.',
      })
    }

    const savedProfile =
      body.saveOverrides && resolvedProfileId
        ? await saveBuyerProfile(event, user.id, resolvedProfileId, effectiveAnswers)
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
      buyerProfileId: resolvedProfileId,
      buyerProfileNameSnapshot: profileData?.name ?? null,
      profileSnapshotJson: JSON.stringify(result.profile),
      generatedFilterJson: JSON.stringify(result.filters),
      resultSummaryJson: JSON.stringify(result.summary),
      rankedBoatIdsJson: JSON.stringify(result.rankedBoatIds),
      aiTraceJson: result.aiTrace ? JSON.stringify(result.aiTrace) : null,
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

    // Mark run success AFTER the session is persisted successfully
    if (resolvedProfileId) {
      await markBuyerProfileRunSuccess(event, user.id, resolvedProfileId)
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
