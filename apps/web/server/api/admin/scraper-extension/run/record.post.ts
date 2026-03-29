import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamRecordSchema } from '~~/lib/scraperPipeline'
import { persistScraperBrowserRecord } from '#server/utils/scraperPipelineEngine'

export default defineAdminMutation(
  {
    rateLimit: {
      namespace: 'admin-scraper-extension-run-record',
      maxRequests: 5000,
      windowMs: 60_000,
    },
    parseBody: withValidatedBody(scraperPipelineStreamRecordSchema.parse),
  },
  async ({ event, body }) => {
    const result = await persistScraperBrowserRecord(event, {
      draft: body.draft,
      record: body.record,
    })

    return {
      inserted: result.inserted,
      updated: result.updated,
      warnings: result.candidate.warnings,
    }
  },
)
