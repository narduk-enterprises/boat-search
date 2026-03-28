import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelinePreviewSchema } from '~~/lib/scraperPipeline'
import { previewScraperPipeline } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: { namespace: 'admin-scraper-pipeline-preview', maxRequests: 12, windowMs: 60_000 },
    parseBody: withValidatedBody(scraperPipelinePreviewSchema.parse),
  },
  async ({ body }) => {
    const summary = await previewScraperPipeline(body)
    return { summary }
  },
)
