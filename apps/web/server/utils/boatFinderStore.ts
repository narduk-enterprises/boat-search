import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import {
  buyerProfileSchema,
  createEmptyBuyerProfile,
  normalizeBuyerProfileDraft,
  type BuyerProfile,
  type BuyerProfileDraft,
} from '~~/lib/boatFinder'
import { buyerProfiles } from '~~/server/database/schema'

export async function getBuyerProfile(
  event: H3Event,
  userId: string,
): Promise<{
  profile: BuyerProfileDraft
  updatedAt?: string
  isComplete: boolean
}> {
  const db = useAppDatabase(event)
  const row = await db.select().from(buyerProfiles).where(eq(buyerProfiles.userId, userId)).get()

  if (!row) {
    return {
      profile: createEmptyBuyerProfile(),
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

  const parsed = normalizeBuyerProfileDraft(rawProfile)

  return {
    profile: parsed,
    updatedAt: row.updatedAt,
    isComplete: buyerProfileSchema.safeParse(parsed).success,
  }
}

export async function upsertBuyerProfile(event: H3Event, userId: string, profileInput: unknown) {
  const db = useAppDatabase(event)
  const profile = buyerProfileSchema.parse(profileInput)
  const now = new Date().toISOString()
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
    updatedAt: now,
  } satisfies { profile: BuyerProfile; updatedAt: string }
}
