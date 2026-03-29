import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import {
  buildBuyerContext,
  buyerAnswersDraftSchema,
  createEmptyBuyerProfile,
  getEffectiveBuyerAnswers,
  isBuyerAnswersComplete,
  normalizeBuyerAnswersDraft,
  normalizeBuyerProfileDraft,
  type BuyerAnswersDraft,
  type BuyerProfileDraft,
} from '~~/lib/boatFinder'
import { buyerProfiles } from '~~/server/database/schema'

export async function getBuyerProfile(
  event: H3Event,
  userId: string,
): Promise<{
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  updatedAt?: string
  isComplete: boolean
}> {
  const db = useAppDatabase(event)
  const row = await db.select().from(buyerProfiles).where(eq(buyerProfiles.userId, userId)).get()

  if (!row) {
    const emptyProfile = createEmptyBuyerProfile()
    return {
      profile: emptyProfile,
      effectiveAnswers: getEffectiveBuyerAnswers(emptyProfile),
      updatedAt: undefined,
      isComplete: false,
    }
  }

  let rawProfile: unknown = {}
  try {
    rawProfile = JSON.parse(row.dataJson)
  } catch {
    rawProfile = {}
  }

  const profile = normalizeBuyerProfileDraft(rawProfile)
  const effectiveAnswers = getEffectiveBuyerAnswers(profile)

  return {
    profile: {
      ...profile,
      normalizedContext: profile.normalizedContext ?? buildBuyerContext(effectiveAnswers),
    },
    effectiveAnswers,
    updatedAt: row.updatedAt,
    isComplete: isBuyerAnswersComplete(profile.coreAnswers),
  }
}

export async function upsertBuyerProfile(event: H3Event, userId: string, answersInput: unknown) {
  const db = useAppDatabase(event)
  const coreAnswers = buyerAnswersDraftSchema.parse(normalizeBuyerAnswersDraft(answersInput))
  const now = new Date().toISOString()
  const profile = {
    version: 2 as const,
    coreAnswers,
    sessionOverrides: {
      facts: {},
      preferences: {},
      reflectiveAnswers: {},
      questionStates: {},
    },
    normalizedContext: buildBuyerContext(coreAnswers),
  }
  const dataJson = JSON.stringify(profile)
  const existing = await db
    .select({ userId: buyerProfiles.userId })
    .from(buyerProfiles)
    .where(eq(buyerProfiles.userId, userId))
    .get()

  if (existing) {
    await db
      .update(buyerProfiles)
      .set({ dataJson, updatedAt: now })
      .where(eq(buyerProfiles.userId, userId))
      .run()
  } else {
    await db.insert(buyerProfiles).values({ userId, dataJson, updatedAt: now }).run()
  }

  return {
    profile,
    effectiveAnswers: coreAnswers,
    updatedAt: now,
    isComplete: isBuyerAnswersComplete(coreAnswers),
  } satisfies {
    profile: BuyerProfileDraft
    effectiveAnswers: BuyerAnswersDraft
    updatedAt: string
    isComplete: boolean
  }
}
