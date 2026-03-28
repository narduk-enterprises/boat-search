import { requireAdmin } from '#layer/server/utils/auth'
import { listScraperPipelines } from '#server/utils/scraperPipelineStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    pipelines: await listScraperPipelines(event),
  }
})
