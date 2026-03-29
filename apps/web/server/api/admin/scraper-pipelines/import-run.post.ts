import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineMutationSchema } from '~~/lib/scraperPipeline'
import {
  createScraperPipeline,
  findScraperPipelineByIdentity,
  updateScraperPipeline,
} from '#server/utils/scraperPipelineStore'
import { runScraperPipeline } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-pipeline-import-run',
      maxRequests: 30,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineMutationSchema.parse),
  },
  async ({ event, body }) => {
    const existingPipeline = await findScraperPipelineByIdentity(event, body.name, body.boatSource)
    const pipeline = existingPipeline
      ? await updateScraperPipeline(event, existingPipeline.id, body)
      : await createScraperPipeline(event, body)

    const result = await runScraperPipeline(event, {
      pipelineId: pipeline.id,
      draft: pipeline,
    })

    return {
      pipelineId: pipeline.id,
      pipeline,
      ...result,
    }
  },
)
