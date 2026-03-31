import { and, eq, isNull } from 'drizzle-orm'
import { defineCronMutation } from '#layer/server/utils/mutation'
import { boats } from '~~/server/database/schema'
import { resolveBoatGeoWriteFields } from '#server/utils/boatGeo'

/**
 * Hourly cron job to backfill geocoding for unmapped boats.
 * Processes up to 100 boats per run to stay well within edge timeouts.
 * Schedule via Cloudflare Cron Triggers + Authorization: Bearer CRON_SECRET.
 */
export default defineCronMutation(
  {
    rateLimit: { namespace: 'cron-geo-backfill', maxRequests: 2, windowMs: 60_000 },
  },
  async ({ event }) => {
    const db = useAppDatabase(event)
    const limit = 100

    // Find boats needing geocoding:
    // 1. geo_status IS NULL — never attempted
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
      .where(and(isNull(boats.supersededByBoatId), isNull(boats.geoStatus)))
      .limit(limit)

    const results = {
      processed: 0,
      matched: 0,
      skipped: 0,
      failed: 0,
      ambiguous: 0,
      unchanged: 0,
      errors: [] as Array<{ boatId: number; error: string }>,
    }

    if (candidates.length === 0) {
      return { ok: true, complete: true, ...results }
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
          existing: candidate,
        })

        if (!geoFields) {
          results.unchanged++
          continue
        }

        await db
          .update(boats)
          .set({ ...geoFields, updatedAt: new Date().toISOString() })
          .where(eq(boats.id, candidate.id))
          .run()

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
            if (
              results.processed === 1 &&
              typeof geoFields.geoError === 'string' &&
              (geoFields.geoError.includes('401') || geoFields.geoError.includes('Not Authorized'))
            ) {
              return {
                ok: false,
                ...results,
                abortedEarly: true,
                abortReason: 'Apple Maps auth failed on first attempt.',
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

    // Trim errors to the last 10
    if (results.errors.length > 10) {
      results.errors = results.errors.slice(-10)
    }

    return { ok: true, complete: false, ...results }
  },
)
