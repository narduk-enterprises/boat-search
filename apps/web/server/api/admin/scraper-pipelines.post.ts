import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineMutationSchema } from '~~/lib/scraperPipeline'
import { createScraperPipeline } from '#server/utils/scraperPipelineStore'

export default defineAdminMutation(
  {
    rateLimit: { namespace: 'admin-scraper-pipeline-create', maxRequests: 20, windowMs: 60_000 },
    parseBody: withValidatedBody(scraperPipelineMutationSchema.parse),
  },
  async ({ event, body }) => {
    const pipeline = await createScraperPipeline(event, body)
    return { pipeline }
  },
)
