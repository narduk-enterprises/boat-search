import { defineAdminMutation } from '#layer/server/utils/mutation'
import { getScraperPipeline } from '#server/utils/scraperPipelineStore'
import { runScraperPipeline } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: { namespace: 'admin-scraper-pipeline-run', maxRequests: 30, windowMs: 60_000 },
  },
  async ({ event }) => {
    const pipelineId = Number.parseInt(getRouterParam(event, 'pipelineId') || '', 10)
    if (!Number.isFinite(pipelineId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Pipeline ID is required.',
      })
    }

    const pipeline = await getScraperPipeline(event, pipelineId)
    if (!pipeline) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Scraper pipeline not found.',
      })
    }

    const result = await runScraperPipeline(event, {
      pipelineId,
      draft: pipeline,
    })

    return result
  },
)
