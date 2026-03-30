import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamStopSchema } from '~~/lib/scraperPipeline'
import { markCrawlJobStopRequested } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-stop',
      maxRequests: 300,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamStopSchema.parse),
  },
  async ({ event, body }) => {
    await markCrawlJobStopRequested(event, {
      jobId: body.jobId,
      message: body.message,
    })

    return {
      ok: true as const,
    }
  },
)
