import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineBrowserRunSchema } from '~~/lib/scraperPipeline'
import {
  createScraperPipeline,
  findScraperPipelineByIdentity,
  updateScraperPipeline,
} from '#server/utils/scraperPipelineStore'
import { ingestScraperPipelineRun } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-pipeline-browser-run',
      maxRequests: 30,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineBrowserRunSchema.parse),
  },
  async ({ event, body }) => {
    const existingPipeline = await findScraperPipelineByIdentity(
      event,
      body.draft.name,
      body.draft.boatSource,
    )
    const pipeline = existingPipeline
      ? await updateScraperPipeline(event, existingPipeline.id, body.draft)
      : await createScraperPipeline(event, body.draft)

    const result = await ingestScraperPipelineRun(event, {
      pipelineId: pipeline.id,
      draft: pipeline,
      records: body.records,
      summary: body.summary,
    })

    return {
      pipelineId: pipeline.id,
      pipeline,
      ...result,
    }
  },
)
