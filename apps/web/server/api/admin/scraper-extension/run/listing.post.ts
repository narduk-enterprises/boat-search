import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamListingSchema } from '~~/lib/scraperPipeline'
import { storeCrawlJobListingAudit } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-listing',
      maxRequests: 6000,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamListingSchema.parse),
  },
  async ({ event, body }) => {
    await storeCrawlJobListingAudit(event, {
      jobId: body.jobId,
      listing: body.listing,
    })

    return {
      ok: true as const,
    }
  },
)
