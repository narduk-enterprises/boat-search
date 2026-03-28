import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamCompleteSchema } from '~~/lib/scraperPipeline'
import { completeScraperPipelineJob } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-complete',
      maxRequests: 12,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamCompleteSchema.parse),
  },
  async ({ event, body }) =>
    await completeScraperPipelineJob(event, {
      pipelineId: body.pipelineId,
      jobId: body.jobId,
      draft: body.draft,
      summary: body.summary,
      inserted: body.inserted,
      updated: body.updated,
    }),
)
