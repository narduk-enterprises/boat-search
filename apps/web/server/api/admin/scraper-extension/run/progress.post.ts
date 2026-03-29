import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamProgressSchema } from '~~/lib/scraperPipeline'
import { storeRunningScraperPipelineJobProgress } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-progress',
      maxRequests: 1200,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamProgressSchema.parse),
  },
  async ({ event, body }) =>
    await storeRunningScraperPipelineJobProgress(event, {
      jobId: body.jobId,
      summary: body.summary,
      progress: body.progress,
      inserted: body.inserted,
      updated: body.updated,
    }),
)
