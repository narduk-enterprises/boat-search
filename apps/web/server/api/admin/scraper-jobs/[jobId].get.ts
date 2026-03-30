import { z } from 'zod'
import { requireAdmin } from '#layer/server/utils/auth'
import { getCrawlJobAuditDetail } from '#server/utils/scraperPipelineEngine'
import type {
  ScraperDetailStatus,
  ScraperDuplicateDecision,
  ScraperPersistenceStatus,
} from '~~/lib/scraperPipeline'

const querySchema = z.object({
  duplicateDecision: z.string().trim().optional(),
  detailStatus: z.string().trim().optional(),
  persistenceStatus: z.string().trim().optional(),
  weakFingerprintOnly: z.enum(['0', '1', 'false', 'true']).optional(),
  errorsOnly: z.enum(['0', '1', 'false', 'true']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})

function toBooleanFlag(value: string | undefined) {
  return value === '1' || value === 'true'
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const jobId = Number.parseInt(getRouterParam(event, 'jobId') || '', 10)
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid scraper job id is required.',
    })
  }

  const query = querySchema.parse(getQuery(event))

  return await getCrawlJobAuditDetail(event, {
    jobId,
    filters: {
      duplicateDecision:
        query.duplicateDecision === 'all' || query.duplicateDecision == null
          ? 'all'
          : (query.duplicateDecision as ScraperDuplicateDecision),
      detailStatus:
        query.detailStatus === 'all' || query.detailStatus == null
          ? 'all'
          : (query.detailStatus as ScraperDetailStatus),
      persistenceStatus:
        query.persistenceStatus === 'all' || query.persistenceStatus == null
          ? 'all'
          : (query.persistenceStatus as ScraperPersistenceStatus),
      weakFingerprintOnly: toBooleanFlag(query.weakFingerprintOnly),
      errorsOnly: toBooleanFlag(query.errorsOnly),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 25,
    },
  })
})
