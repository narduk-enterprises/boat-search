import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { boats } from '~~/server/database/schema'
import { resolveBoatGeoWriteFields } from '#server/utils/boatGeo'
import { z } from 'zod'
import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'

const bodySchema = z.object({
  /** Maximum number of boats to process in this batch. */
  limit: z.coerce.number().min(1).max(200).default(50),
  /** When true, normalize only — skip live geocoding (no Apple Maps API calls). */
  dryRun: z.coerce.boolean().default(false),
  /** When true, retry boats that previously failed with auth errors. */
  retryAuthFailures: z.coerce.boolean().default(true),
})

export default defineAdminMutation(
  {
    rateLimit: { namespace: 'geo-backfill', maxRequests: 4, windowMs: 60_000 },
    parseBody: withValidatedBody(bodySchema.parse),
  },
  async ({ event, body }) => {
    const db = useAppDatabase(event)

    // Find boats needing geocoding:
    // 1. geo_status IS NULL — never attempted
    // 2. geo_status = 'failed' AND geo_error LIKE '%401%' or '%Not Authorized%' — retryable auth failures
    const retryAuthCondition = body.retryAuthFailures
      ? or(
          sql`${boats.geoError} LIKE '%401%'`,
          sql`${boats.geoError} LIKE '%Not Authorized%'`,
          sql`${boats.geoError} LIKE '%token exchange%'`,
        )
      : undefined

    const candidates = await db
      .select({
        id: boats.id,
        location: boats.location,
        city: boats.city,
        state: boats.state,
        country: boats.country,
        normalizedLocation: boats.normalizedLocation,
        normalizedCity: boats.normalizedCity,
        normalizedState: boats.normalizedState,
        normalizedCountry: boats.normalizedCountry,
        geoLat: boats.geoLat,
        geoLng: boats.geoLng,
        geoPrecision: boats.geoPrecision,
        geoProvider: boats.geoProvider,
        geoStatus: boats.geoStatus,
        geoQuery: boats.geoQuery,
        geoError: boats.geoError,
        geoUpdatedAt: boats.geoUpdatedAt,
        geoNormalizationVersion: boats.geoNormalizationVersion,
      })
      .from(boats)
      .where(
        and(
          isNull(boats.supersededByBoatId),
          or(
            isNull(boats.geoStatus),
            ...(retryAuthCondition
              ? [and(eq(boats.geoStatus, 'failed'), retryAuthCondition)]
              : []),
          ),
        ),
      )
      .limit(body.limit)

    const results = {
      processed: 0,
      matched: 0,
      skipped: 0,
      failed: 0,
      ambiguous: 0,
      unchanged: 0,
      errors: [] as Array<{ boatId: number; error: string }>,
    }

    for (const candidate of candidates) {
      const input = {
        location: candidate.location,
        city: candidate.city,
        state: candidate.state,
        country: candidate.country,
      }

      try {
        const geoFields = await resolveBoatGeoWriteFields(db, input, {
          existing: body.dryRun ? null : candidate,
        })

        if (!geoFields) {
          results.unchanged++
          continue
        }

        if (!body.dryRun) {
          await db
            .update(boats)
            .set({ ...geoFields, updatedAt: new Date().toISOString() })
            .where(eq(boats.id, candidate.id))
            .run()
        }

        results.processed++

        switch (geoFields.geoStatus) {
          case 'matched':
            results.matched++
            break
          case 'skipped':
            results.skipped++
            break
          case 'failed':
            results.failed++
            results.errors.push({
              boatId: candidate.id,
              error: geoFields.geoError ?? 'unknown',
            })
            // If we get an auth failure on the first attempt, stop the batch early
            // to avoid burning through all candidates with the same error
            if (
              results.processed === 1 &&
              typeof geoFields.geoError === 'string' &&
              (geoFields.geoError.includes('401') || geoFields.geoError.includes('Not Authorized'))
            ) {
              return {
                ...results,
                abortedEarly: true,
                abortReason:
                  'Apple Maps auth failed on first attempt. Check APPLE_SECRET_KEY, APPLE_TEAM_ID, and APPLE_KEY_ID environment variables.',
              }
            }
            break
          case 'ambiguous':
            results.ambiguous++
            break
        }
      } catch (error) {
        results.processed++
        results.failed++
        results.errors.push({
          boatId: candidate.id,
          error: error instanceof Error ? error.message : 'unknown_error',
        })
      }
    }

    // Trim errors to the last 10 to keep the response size reasonable
    if (results.errors.length > 10) {
      results.errors = results.errors.slice(-10)
    }

    // Get updated totals for the response
    const [totals] = await db
      .select({
        totalActive: sql<number>`COUNT(*)`,
        geoNull: sql<number>`SUM(CASE WHEN ${boats.geoStatus} IS NULL THEN 1 ELSE 0 END)`,
        geoMatched: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'matched' THEN 1 ELSE 0 END)`,
        geoFailed: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'failed' THEN 1 ELSE 0 END)`,
        geoSkipped: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'skipped' THEN 1 ELSE 0 END)`,
      })
      .from(boats)
      .where(isNull(boats.supersededByBoatId))

    return {
      ...results,
      dryRun: body.dryRun,
      remaining: {
        totalActive: totals?.totalActive ?? 0,
        needsGeocoding: (totals?.geoNull ?? 0) + (body.retryAuthFailures ? (totals?.geoFailed ?? 0) : 0),
        geoNull: totals?.geoNull ?? 0,
        geoMatched: totals?.geoMatched ?? 0,
        geoFailed: totals?.geoFailed ?? 0,
        geoSkipped: totals?.geoSkipped ?? 0,
      },
    }
  },
)
