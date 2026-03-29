import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamFailSchema } from '~~/lib/scraperPipeline'
import { failScraperPipelineJob } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-fail',
      maxRequests: 120,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamFailSchema.parse),
  },
  async ({ event, body }) =>
    await failScraperPipelineJob(event, {
      jobId: body.jobId,
      summary: body.summary,
      inserted: body.inserted,
      updated: body.updated,
      error: body.error,
    }),
)
