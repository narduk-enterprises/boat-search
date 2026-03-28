import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineMutationSchema } from '~~/lib/scraperPipeline'
import { updateScraperPipeline } from '#server/utils/scraperPipelineStore'

export default defineAdminMutation(
  {
    rateLimit: { namespace: 'admin-scraper-pipeline-update', maxRequests: 30, windowMs: 60_000 },
    parseBody: withValidatedBody(scraperPipelineMutationSchema.parse),
  },
  async ({ event, body }) => {
    const pipelineId = Number.parseInt(getRouterParam(event, 'pipelineId') || '', 10)
    if (!Number.isFinite(pipelineId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pipeline ID is required.',
      })
    }

    const pipeline = await updateScraperPipeline(event, pipelineId, body)
    return { pipeline }
  },
)
