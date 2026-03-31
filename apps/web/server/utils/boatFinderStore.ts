import type { H3Event } from 'h3'
import { and, desc, eq, sql } from 'drizzle-orm'
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
import { buyerProfiles, recommendationSessions } from '~~/server/database/schema'

const MAX_PROFILES_PER_USER = 5
const COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours
export const DAILY_RUN_LIMIT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBuyerProfileRow(row: {
  id: number
  userId: string
  name: string
  isActive: boolean
  dataJson: string
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}) {
  let rawProfile: unknown = {}
  try {
    rawProfile = JSON.parse(row.dataJson)
  } catch {
    rawProfile = {}
  }

  const profile = normalizeBuyerProfileDraft(rawProfile)
  const effectiveAnswers = getEffectiveBuyerAnswers(profile)

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    isActive: row.isActive,
    profile: {
      ...profile,
      normalizedContext: profile.normalizedContext ?? buildBuyerContext(effectiveAnswers),
    },
    effectiveAnswers,
    isComplete: isBuyerAnswersComplete(profile.coreAnswers),
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function computeRunState(lastRunAt: string | null, options?: { isAdmin?: boolean }) {
  if (options?.isAdmin || !lastRunAt) {
    return { canRunNow: true, nextRunAvailableAt: null }
  }
  const lastRunTime = new Date(lastRunAt).getTime()
  const nextRunTime = lastRunTime + COOLDOWN_MS
  const now = Date.now()
  return {
    canRunNow: now >= nextRunTime,
    nextRunAvailableAt: now >= nextRunTime ? null : new Date(nextRunTime).toISOString(),
  }
}

export function generateDuplicateName(existingNames: string[], baseName: string): string {
  const candidate = `${baseName} Copy`
  if (!existingNames.includes(candidate)) return candidate
  let suffix = 2
  while (true) {
    const numbered = `${baseName} Copy ${suffix}`
    if (!existingNames.includes(numbered)) return numbered
    suffix++
    if (suffix > 100) return `${baseName} Copy ${Date.now()}`
  }
}

// ---------------------------------------------------------------------------
// List / Get
// ---------------------------------------------------------------------------

export async function listBuyerProfiles(
  event: H3Event,
  userId: string,
  options?: { isAdmin?: boolean },
) {
  const db = useAppDatabase(event)
  const rows = await db
    .select()
    .from(buyerProfiles)
    .where(eq(buyerProfiles.userId, userId))
    .orderBy(desc(buyerProfiles.updatedAt))

  const profiles = rows.map((row) => {
    const parsed = parseBuyerProfileRow(row)
    const runState = computeRunState(parsed.lastRunAt, options)
    return {
      id: parsed.id,
      name: parsed.name,
      isActive: parsed.isActive,
      isComplete: parsed.isComplete,
      lastRunAt: parsed.lastRunAt,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      canRunNow: runState.canRunNow,
      nextRunAvailableAt: runState.nextRunAvailableAt,
    }
  })

  const activeProfile = profiles.find((p) => p.isActive)
  return { profiles, activeProfileId: activeProfile?.id ?? null }
}

export async function getBuyerProfileById(
  event: H3Event,
  userId: string,
  profileId: number,
  options?: { isAdmin?: boolean },
) {
  const db = useAppDatabase(event)
  const row = await db
    .select()
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .get()

  if (!row) return null

  const parsed = parseBuyerProfileRow(row)
  const runState = computeRunState(parsed.lastRunAt, options)

  // Get latest session ID for this profile
  const latestSession = await db
    .select({ id: recommendationSessions.id })
    .from(recommendationSessions)
    .where(
      and(
        eq(recommendationSessions.userId, userId),
        eq(recommendationSessions.buyerProfileId, profileId),
      ),
    )
    .orderBy(desc(recommendationSessions.createdAt))
    .limit(1)
    .get()

  return {
    id: parsed.id,
    name: parsed.name,
    isActive: parsed.isActive,
    profile: parsed.profile,
    effectiveAnswers: parsed.effectiveAnswers,
    isComplete: parsed.isComplete,
    lastRunAt: parsed.lastRunAt,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    canRunNow: runState.canRunNow,
    nextRunAvailableAt: runState.nextRunAvailableAt,
    latestSessionId: latestSession?.id ?? null,
  }
}

export async function getActiveBuyerProfile(event: H3Event, userId: string) {
  const db = useAppDatabase(event)
  const row = await db
    .select()
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.userId, userId), eq(buyerProfiles.isActive, true)))
    .get()

  if (!row) return null
  return parseBuyerProfileRow(row)
}

// ---------------------------------------------------------------------------
// Create / Duplicate
// ---------------------------------------------------------------------------

export async function createBuyerProfile(
  event: H3Event,
  userId: string,
  name: string,
  sourceProfileId?: number,
) {
  const db = useAppDatabase(event)

  // Enforce cap
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(buyerProfiles)
    .where(eq(buyerProfiles.userId, userId))
    .get()

  const currentCount = countResult?.count ?? 0
  if (currentCount >= MAX_PROFILES_PER_USER) {
    throw createError({
      statusCode: 400,
      statusMessage: `You can have at most ${MAX_PROFILES_PER_USER} buyer profiles.`,
    })
  }

  const now = new Date().toISOString()
  let dataJson = JSON.stringify(createEmptyBuyerProfile())

  // Duplicate from source profile
  if (sourceProfileId != null) {
    const source = await db
      .select({ dataJson: buyerProfiles.dataJson })
      .from(buyerProfiles)
      .where(and(eq(buyerProfiles.id, sourceProfileId), eq(buyerProfiles.userId, userId)))
      .get()

    if (!source) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Source profile not found.',
      })
    }
    dataJson = source.dataJson
  }

  // If first profile, make it active; otherwise inactive
  const isFirst = currentCount === 0

  await db.insert(buyerProfiles).values({
    userId,
    name: name.trim().slice(0, 100) || 'New profile',
    isActive: isFirst,
    dataJson,
    createdAt: now,
    updatedAt: now,
  })

  // Retrieve the inserted row
  const inserted = await db
    .select()
    .from(buyerProfiles)
    .where(eq(buyerProfiles.userId, userId))
    .orderBy(desc(buyerProfiles.id))
    .limit(1)
    .get()

  if (!inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create buyer profile.' })
  }

  return parseBuyerProfileRow(inserted)
}

// ---------------------------------------------------------------------------
// Save / Rename / Activate / Delete
// ---------------------------------------------------------------------------

export async function saveBuyerProfile(
  event: H3Event,
  userId: string,
  profileId: number,
  answersInput: unknown,
) {
  const db = useAppDatabase(event)

  // Ownership check
  const existing = await db
    .select({ id: buyerProfiles.id })
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  const coreAnswers = buyerAnswersDraftSchema.parse(normalizeBuyerAnswersDraft(answersInput))
  const now = new Date().toISOString()
  const profile: BuyerProfileDraft = {
    version: 2,
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

  await db
    .update(buyerProfiles)
    .set({ dataJson, updatedAt: now })
    .where(eq(buyerProfiles.id, profileId))
    .run()

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

export async function renameBuyerProfile(
  event: H3Event,
  userId: string,
  profileId: number,
  name: string,
) {
  const db = useAppDatabase(event)

  const existing = await db
    .select({ id: buyerProfiles.id })
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .get()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  const now = new Date().toISOString()
  await db
    .update(buyerProfiles)
    .set({ name: name.trim().slice(0, 100) || 'Untitled profile', updatedAt: now })
    .where(eq(buyerProfiles.id, profileId))
    .run()

  return { id: profileId, name: name.trim().slice(0, 100), updatedAt: now }
}

export async function activateBuyerProfile(event: H3Event, userId: string, profileId: number) {
  const db = useAppDatabase(event)

  const target = await db
    .select({ id: buyerProfiles.id })
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .get()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  const now = new Date().toISOString()

  // Deactivate all profiles for this user
  await db
    .update(buyerProfiles)
    .set({ isActive: false, updatedAt: now })
    .where(eq(buyerProfiles.userId, userId))
    .run()

  // Activate the target
  await db
    .update(buyerProfiles)
    .set({ isActive: true, updatedAt: now })
    .where(eq(buyerProfiles.id, profileId))
    .run()

  return { id: profileId, isActive: true }
}

export async function deleteBuyerProfile(event: H3Event, userId: string, profileId: number) {
  const db = useAppDatabase(event)

  // Count remaining profiles
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(buyerProfiles)
    .where(eq(buyerProfiles.userId, userId))
    .get()

  if ((countResult?.count ?? 0) <= 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cannot delete your last remaining profile.',
    })
  }

  // Check ownership and active status
  const target = await db
    .select({ id: buyerProfiles.id, isActive: buyerProfiles.isActive })
    .from(buyerProfiles)
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .get()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Buyer profile not found.' })
  }

  const wasActive = target.isActive

  await db.delete(buyerProfiles).where(eq(buyerProfiles.id, profileId)).run()

  // If the deleted profile was active, promote the most recently updated remaining one
  if (wasActive) {
    const nextActive = await db
      .select({ id: buyerProfiles.id })
      .from(buyerProfiles)
      .where(eq(buyerProfiles.userId, userId))
      .orderBy(desc(buyerProfiles.updatedAt))
      .limit(1)
      .get()

    if (nextActive) {
      await db
        .update(buyerProfiles)
        .set({ isActive: true, updatedAt: new Date().toISOString() })
        .where(eq(buyerProfiles.id, nextActive.id))
        .run()
    }
  }

  return { deleted: true, promotedProfileId: wasActive ? undefined : null }
}

// ---------------------------------------------------------------------------
// Cooldown
// ---------------------------------------------------------------------------

export function checkProfileRunCooldown(lastRunAt: string | null) {
  return computeRunState(lastRunAt)
}

/**
 * Count how many recommendation sessions this user has created since midnight UTC today.
 * Returns the count plus whether they can still run.
 */
export async function checkDailyRunLimit(event: H3Event, userId: string) {
  const db = useAppDatabase(event)
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(recommendationSessions)
    .where(
      and(
        eq(recommendationSessions.userId, userId),
        sql`${recommendationSessions.createdAt} >= ${todayIso}`,
      ),
    )
    .get()

  const dailyRunCount = result?.count ?? 0
  return {
    dailyRunCount,
    dailyRunLimit: DAILY_RUN_LIMIT,
    canRunToday: dailyRunCount < DAILY_RUN_LIMIT,
    runsRemaining: Math.max(0, DAILY_RUN_LIMIT - dailyRunCount),
  }
}

export async function markBuyerProfileRunSuccess(
  event: H3Event,
  userId: string,
  profileId: number,
) {
  const db = useAppDatabase(event)
  const now = new Date().toISOString()
  await db
    .update(buyerProfiles)
    .set({ lastRunAt: now })
    .where(and(eq(buyerProfiles.id, profileId), eq(buyerProfiles.userId, userId)))
    .run()
  return now
}

// ---------------------------------------------------------------------------
// Legacy compatibility shim — returns the active profile in the old shape
// Used by callers not yet migrated to multi-profile.
// ---------------------------------------------------------------------------

export async function getBuyerProfile(
  event: H3Event,
  userId: string,
): Promise<{
  profile: BuyerProfileDraft
  effectiveAnswers: BuyerAnswersDraft
  updatedAt?: string
  isComplete: boolean
}> {
  const active = await getActiveBuyerProfile(event, userId)
  if (!active) {
    const emptyProfile = createEmptyBuyerProfile()
    return {
      profile: emptyProfile,
      effectiveAnswers: getEffectiveBuyerAnswers(emptyProfile),
      updatedAt: undefined,
      isComplete: false,
    }
  }
  return {
    profile: active.profile,
    effectiveAnswers: active.effectiveAnswers,
    updatedAt: active.updatedAt,
    isComplete: active.isComplete,
  }
}
