import { defineAdminMutation, withValidatedBody } from '#layer/server/utils/mutation'
import { scraperPipelineStreamRecordSchema } from '~~/lib/scraperPipeline'
import {
  persistScraperBrowserRecord,
  storeCrawlJobListingAudit,
} from '#server/utils/scraperPipelineEngine'

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
      detailArtifact: body.detailArtifact,
    })
    await storeCrawlJobListingAudit(event, {
      jobId: body.jobId,
      listing: {
        ...body.listing,
        warnings: result.candidate.warnings,
        finalImageCount: body.record.images.length,
        finalHasStructuredDetails: Boolean(
          body.record.contactInfo ||
          body.record.otherDetails ||
          body.record.features ||
          body.record.propulsion ||
          body.record.specifications,
        ),
        error: null,
        auditJson: {
          ...(body.listing.auditJson || {}),
          lastPersistedAt: new Date().toISOString(),
          rawFieldCount: Object.keys(body.record.rawFields || {}).length,
          detailArtifactLatestKey: result.detailArtifact?.latestKey ?? null,
          detailArtifactVersionKey: result.detailArtifact?.versionKey ?? null,
          detailArtifactPageCount: result.detailArtifact?.pageCount ?? 0,
          detailArtifactPageUrls: result.detailArtifact?.pageUrls ?? [],
          detailArtifactCapturedAt: result.detailArtifact?.capturedAt ?? null,
          detailArtifactStoredAt: result.detailArtifact?.storedAt ?? null,
        },
      },
      persistenceStatus: result.persistenceStatus,
      persistedBoatId: result.boatId,
    })

    return {
      boatId: result.boatId,
      persistenceStatus: result.persistenceStatus,
      inserted: result.inserted,
      updated: result.updated,
      imagesUploaded: result.imagesUploaded,
      warnings: result.candidate.warnings,
      detailArtifactKey: result.detailArtifact?.latestKey ?? null,
    }
  },
)
