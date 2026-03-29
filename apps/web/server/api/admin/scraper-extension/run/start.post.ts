import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamStartSchema } from '~~/lib/scraperPipeline'
import {
  createScraperPipeline,
  findScraperPipelineByIdentity,
  updateScraperPipeline,
} from '#server/utils/scraperPipelineStore'
import { createRunningCrawlJob } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-start',
      maxRequests: 60,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamStartSchema.parse),
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

    const startedAt = new Date().toISOString()
    const jobId = await createRunningCrawlJob(event, {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      searchUrl: pipeline.config.startUrls.join('\n'),
      runMode: 'extension',
      startedAt,
    })

    return {
      pipelineId: pipeline.id,
      pipeline,
      jobId,
      startedAt,
    }
  },
)
