import { z } from 'zod'

export const SCRAPER_FIELD_KEYS = [
  'url',
  'listingId',
  'title',
  'make',
  'model',
  'year',
  'length',
  'price',
  'currency',
  'location',
  'city',
  'state',
  'country',
  'description',
  'sellerType',
  'listingType',
  'images',
  'fullText',
] as const

export const SCRAPER_FIELD_SCOPES = ['item', 'detail', 'detail-follow'] as const
export const SCRAPER_FIELD_EXTRACT_TYPES = ['text', 'attr', 'html'] as const
export const SCRAPER_FIELD_TRANSFORMS = ['text', 'price', 'year', 'integer', 'url'] as const
export const SCRAPER_PIPELINE_MAX_PAGES = 500
export const SCRAPER_PIPELINE_MAX_ITEMS_PER_RUN = 2000

/** Detail backfill (v1): only YachtWorld listing detail URLs in `startUrls`. */
export function isYachtWorldDetailBackfillUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host !== 'www.yachtworld.com' && host !== 'yachtworld.com') {
      return false
    }
    return /\/yacht\//i.test(parsed.pathname)
  } catch {
    return false
  }
}

export type ScraperFieldKey = (typeof SCRAPER_FIELD_KEYS)[number]
export type ScraperFieldScope = (typeof SCRAPER_FIELD_SCOPES)[number]
export type ScraperFieldExtractType = (typeof SCRAPER_FIELD_EXTRACT_TYPES)[number]
export type ScraperFieldTransform = (typeof SCRAPER_FIELD_TRANSFORMS)[number]

export const SCRAPER_FIELD_LABELS: Record<ScraperFieldKey, string> = {
  url: 'Detail URL',
  listingId: 'Listing ID',
  title: 'Title',
  make: 'Make',
  model: 'Model',
  year: 'Year',
  length: 'Length',
  price: 'Price',
  currency: 'Currency',
  location: 'Location',
  city: 'City',
  state: 'State / Region',
  country: 'Country',
  description: 'Description',
  sellerType: 'Seller type',
  listingType: 'Listing type',
  images: 'Images',
  fullText: 'Full text',
}

export const scraperFieldSchema = z
  .object({
    key: z.enum(SCRAPER_FIELD_KEYS),
    scope: z.enum(SCRAPER_FIELD_SCOPES).default('item'),
    selector: z.string().trim().min(1, 'Selector is required'),
    extract: z.enum(SCRAPER_FIELD_EXTRACT_TYPES).default('text'),
    attribute: z.string().trim().max(120).optional().default(''),
    multiple: z.boolean().default(false),
    joinWith: z.string().max(20).default('\n'),
    transform: z.enum(SCRAPER_FIELD_TRANSFORMS).default('text'),
    regex: z.string().trim().max(240).optional().default(''),
    required: z.boolean().default(false),
  })
  .superRefine((field, ctx) => {
    if (field.extract === 'attr' && !field.attribute) {
      ctx.addIssue({
        code: 'custom',
        message: 'Attribute name is required when extract mode is attr.',
        path: ['attribute'],
      })
    }
  })

export const scraperPipelineConfigSchema = z
  .object({
    startUrls: z
      .array(z.string().url('Enter a valid start URL'))
      .min(1, 'Add at least one start URL'),
    allowedDomains: z.array(z.string().trim().min(1)).default([]),
    itemSelector: z.string().trim().min(1, 'Item selector is required'),
    nextPageSelector: z.string().trim().optional().default(''),
    detailFollowLinkSelector: z.string().trim().optional().default(''),
    maxPages: z.number().int().min(1).max(SCRAPER_PIPELINE_MAX_PAGES).default(1),
    maxItemsPerRun: z.number().int().min(1).max(SCRAPER_PIPELINE_MAX_ITEMS_PER_RUN).default(50),
    fetchDetailPages: z.boolean().default(false),
    detailBackfillMode: z.boolean().default(false),
    fields: z.array(scraperFieldSchema).min(1, 'Add at least one field rule'),
  })
  .superRefine((config, ctx) => {
    if (!config.fields.some((field) => field.key === 'url')) {
      ctx.addIssue({
        code: 'custom',
        message: 'A pipeline needs one URL field so the scraper can identify detail pages.',
        path: ['fields'],
      })
    }

    if (
      config.fields.some((field) => field.scope !== 'item') &&
      config.fetchDetailPages === false
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Turn on detail-page fetching when any rule targets detail or detail-follow scope.',
        path: ['fetchDetailPages'],
      })
    }

    if (
      config.fields.some((field) => field.scope === 'detail-follow') &&
      !config.detailFollowLinkSelector
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Add a follow-page selector when any rule targets detail-follow scope.',
        path: ['detailFollowLinkSelector'],
      })
    }
  })

export const scraperPipelineDraftSchema = z
  .object({
    name: z.string().trim().min(1, 'Pipeline name is required').max(120),
    boatSource: z.string().trim().min(1, 'Boat source is required').max(80),
    description: z.string().trim().max(500).default(''),
    active: z.boolean().default(true),
    config: scraperPipelineConfigSchema,
  })
  .superRefine((draft, ctx) => {
    if (!draft.config.detailBackfillMode) {
      return
    }
    if (!draft.config.fetchDetailPages) {
      ctx.addIssue({
        code: 'custom',
        message: 'Detail backfill requires fetching detail pages.',
        path: ['config', 'fetchDetailPages'],
      })
    }
    if (draft.boatSource.trim().toLowerCase() !== 'yachtworld') {
      ctx.addIssue({
        code: 'custom',
        message: 'Detail backfill is only supported when boat source is YachtWorld.',
        path: ['config', 'detailBackfillMode'],
      })
    }
    for (const [index, url] of draft.config.startUrls.entries()) {
      if (!isYachtWorldDetailBackfillUrl(url)) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Each start URL must be a YachtWorld listing detail link (www.yachtworld.com/.../yacht/...).',
          path: ['config', 'startUrls', index],
        })
      }
    }
  })

export const scraperPipelineMutationSchema = scraperPipelineDraftSchema
export const scraperPipelinePreviewSchema = scraperPipelineDraftSchema

const scraperBrowserFieldValueSchema = z.union([z.string(), z.array(z.string())])
const scraperNullableStringField = z.string().trim().nullable().optional().default(null)
const scraperImageReferenceField = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'Image references must be absolute URLs or app-relative asset paths.',
  })

export const SCRAPER_EXTRA_RECORD_TEXT_KEYS = [
  'contactInfo',
  'contactName',
  'contactPhone',
  'otherDetails',
  'disclaimer',
  'features',
  'electricalEquipment',
  'electronics',
  'insideEquipment',
  'outsideEquipment',
  'additionalEquipment',
  'propulsion',
  'engineMake',
  'engineModel',
  'engineYearDetail',
  'totalPower',
  'engineHours',
  'engineTypeDetail',
  'driveType',
  'fuelTypeDetail',
  'propellerType',
  'propellerMaterial',
  'specifications',
  'cruisingSpeed',
  'maxSpeed',
  'range',
  'lengthOverall',
  'maxBridgeClearance',
  'maxDraft',
  'minDraftDetail',
  'beamDetail',
  'dryWeight',
  'windlass',
  'electricalCircuit',
  'deadriseAtTransom',
  'hullMaterial',
  'hullShape',
  'keelType',
  'freshWaterTank',
  'fuelTank',
  'holdingTank',
  'guestHeads',
] as const

export type ScraperExtraRecordTextKey = (typeof SCRAPER_EXTRA_RECORD_TEXT_KEYS)[number]

function buildNullableStringShape<const TKeys extends readonly string[]>(keys: TKeys) {
  return Object.fromEntries(keys.map((key) => [key, scraperNullableStringField])) as {
    [K in TKeys[number]]: typeof scraperNullableStringField
  }
}

const scraperExtraRecordTextShape = buildNullableStringShape(SCRAPER_EXTRA_RECORD_TEXT_KEYS)

export const scraperBrowserRunRecordSchema = z.object({
  source: z.string().trim().min(1).max(80),
  url: z.string().url().nullable(),
  listingId: scraperNullableStringField,
  title: scraperNullableStringField,
  make: scraperNullableStringField,
  model: scraperNullableStringField,
  year: z.number().int().nullable(),
  length: scraperNullableStringField,
  price: scraperNullableStringField,
  currency: scraperNullableStringField,
  location: scraperNullableStringField,
  city: scraperNullableStringField,
  state: scraperNullableStringField,
  country: scraperNullableStringField,
  description: scraperNullableStringField,
  ...scraperExtraRecordTextShape,
  sellerType: scraperNullableStringField,
  listingType: scraperNullableStringField,
  images: z.array(scraperImageReferenceField).default([]),
  sourceImages: z.array(scraperImageReferenceField).optional().default([]),
  fullText: scraperNullableStringField,
  rawFields: z.record(z.string(), scraperBrowserFieldValueSchema).default({}),
  warnings: z.array(z.string()).default([]),
})

export const scraperBrowserRunSummarySchema = z.object({
  pagesVisited: z.number().int().min(0),
  itemsSeen: z.number().int().min(0),
  itemsExtracted: z.number().int().min(0),
  skippedExisting: z.number().int().min(0).default(0),
  visitedUrls: z.array(z.string().url()).default([]),
  warnings: z.array(z.string()).default([]),
})

export const scraperBrowserRunProgressSchema = z.object({
  stage: z.enum(['search', 'detail', 'upload']),
  currentUrl: z.string().url().nullable(),
  pagesVisited: z.number().int().min(0),
  itemsSeen: z.number().int().min(0),
  itemsExtracted: z.number().int().min(0),
  skippedExisting: z.number().int().min(0).default(0),
  detailPagesCompleted: z.number().int().min(0),
  detailPagesTotal: z.number().int().min(0),
  recordsPersisted: z.number().int().min(0),
  imagesUploaded: z.number().int().min(0),
})

export const SCRAPER_CRAWL_JOB_EVENT_TYPES = [
  'started',
  'progress',
  'detail_retry_started',
  'detail_retry_finished',
  'stop_requested',
  'stopped',
  'completed',
  'failed',
] as const

export const SCRAPER_DUPLICATE_DECISIONS = [
  'new',
  'known_duplicate_skipped',
  'weak_existing_refresh',
] as const

export const SCRAPER_DETAIL_STATUSES = [
  'not_attempted',
  'queued',
  'scraped',
  'retry_queued',
  'retry_scraped',
  'failed',
  'stopped',
] as const

export const SCRAPER_PERSISTENCE_STATUSES = [
  'not_attempted',
  'inserted',
  'updated',
  'unchanged',
  'failed',
] as const

const scraperJsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(scraperJsonValueSchema),
    z.record(z.string(), scraperJsonValueSchema),
  ]),
)

export const scraperBrowserRunListingAuditSchema = z.object({
  runId: z.number().int().positive(),
  identityKey: z.string().trim().min(1).max(500),
  source: z.string().trim().min(1).max(80),
  listingId: scraperNullableStringField,
  listingUrl: z.string().url().nullable(),
  detailUrl: z.string().url().nullable(),
  pageNumber: z.number().int().min(1).nullable().optional().default(null),
  duplicateDecision: z.enum(SCRAPER_DUPLICATE_DECISIONS),
  detailStatus: z.enum(SCRAPER_DETAIL_STATUSES),
  detailAttempts: z.number().int().min(0).default(0),
  retryQueued: z.boolean().default(false),
  weakFingerprint: z.boolean().default(false),
  finalImageCount: z.number().int().min(0).nullable().optional().default(null),
  finalHasStructuredDetails: z.boolean().default(false),
  error: scraperNullableStringField,
  warnings: z.array(z.string()).default([]),
  auditJson: z.record(z.string(), scraperJsonValueSchema).optional().default({}),
})

export const scraperPipelineBrowserRunSchema = z.object({
  draft: scraperPipelineDraftSchema,
  records: z.array(scraperBrowserRunRecordSchema),
  summary: scraperBrowserRunSummarySchema,
})

export const scraperPipelineStreamStartSchema = z.object({
  draft: scraperPipelineDraftSchema,
})

export const scraperPipelineStreamRecordSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  draft: scraperPipelineDraftSchema,
  listing: scraperBrowserRunListingAuditSchema,
  record: scraperBrowserRunRecordSchema,
})

export const scraperPipelineStreamListingSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  listing: scraperBrowserRunListingAuditSchema,
})

export const scraperPipelineStreamProgressSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  summary: scraperBrowserRunSummarySchema,
  inserted: z.number().int().min(0),
  updated: z.number().int().min(0),
  progress: scraperBrowserRunProgressSchema,
  eventType: z
    .enum(['progress', 'detail_retry_started', 'detail_retry_finished'])
    .default('progress'),
  message: scraperNullableStringField,
  pageNumber: z.number().int().min(1).nullable().optional().default(null),
  searchUrl: z.string().url().nullable().optional().default(null),
})

export const scraperPipelineStreamCompleteSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  draft: scraperPipelineDraftSchema,
  summary: scraperBrowserRunSummarySchema,
  inserted: z.number().int().min(0),
  updated: z.number().int().min(0),
})

export const scraperPipelineStreamFailSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  draft: scraperPipelineDraftSchema,
  summary: scraperBrowserRunSummarySchema,
  inserted: z.number().int().min(0),
  updated: z.number().int().min(0),
  error: z.string().trim().min(1).max(500),
})

export const scraperPipelineStreamStopSchema = z.object({
  pipelineId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  message: z.string().trim().min(1).max(500),
})

export type ScraperFieldRule = z.infer<typeof scraperFieldSchema>
export type ScraperPipelineConfig = z.infer<typeof scraperPipelineConfigSchema>
export type ScraperPipelineDraft = z.infer<typeof scraperPipelineDraftSchema>
export type ScraperBrowserRunRecord = z.infer<typeof scraperBrowserRunRecordSchema>
export type ScraperBrowserRunSummary = z.infer<typeof scraperBrowserRunSummarySchema>
export type ScraperBrowserRunProgress = z.infer<typeof scraperBrowserRunProgressSchema>
export type ScraperBrowserRunListingAudit = z.infer<typeof scraperBrowserRunListingAuditSchema>
export type ScraperPipelineStreamStart = z.infer<typeof scraperPipelineStreamStartSchema>
export type ScraperPipelineStreamRecord = z.infer<typeof scraperPipelineStreamRecordSchema>
export type ScraperPipelineStreamListing = z.infer<typeof scraperPipelineStreamListingSchema>
export type ScraperPipelineStreamProgress = z.infer<typeof scraperPipelineStreamProgressSchema>
export type ScraperPipelineStreamComplete = z.infer<typeof scraperPipelineStreamCompleteSchema>
export type ScraperPipelineStreamFail = z.infer<typeof scraperPipelineStreamFailSchema>
export type ScraperPipelineStreamStop = z.infer<typeof scraperPipelineStreamStopSchema>
export type ScraperCrawlJobEventType = (typeof SCRAPER_CRAWL_JOB_EVENT_TYPES)[number]
export type ScraperDuplicateDecision = (typeof SCRAPER_DUPLICATE_DECISIONS)[number]
export type ScraperDetailStatus = (typeof SCRAPER_DETAIL_STATUSES)[number]
export type ScraperPersistenceStatus = (typeof SCRAPER_PERSISTENCE_STATUSES)[number]

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export interface ScraperRunRecord {
  source: string
  url: string | null
  title: string | null
  listingId: string | null
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  images: string[]
  sourceImages: string[]
  description: string | null
  contactInfo: string | null
  contactName: string | null
  contactPhone: string | null
  otherDetails: string | null
  disclaimer: string | null
  features: string | null
  electricalEquipment: string | null
  electronics: string | null
  insideEquipment: string | null
  outsideEquipment: string | null
  additionalEquipment: string | null
  propulsion: string | null
  engineMake: string | null
  engineModel: string | null
  engineYearDetail: string | null
  totalPower: string | null
  engineHours: string | null
  engineTypeDetail: string | null
  driveType: string | null
  fuelTypeDetail: string | null
  propellerType: string | null
  propellerMaterial: string | null
  specifications: string | null
  cruisingSpeed: string | null
  maxSpeed: string | null
  range: string | null
  lengthOverall: string | null
  maxBridgeClearance: string | null
  maxDraft: string | null
  minDraftDetail: string | null
  beamDetail: string | null
  dryWeight: string | null
  windlass: string | null
  electricalCircuit: string | null
  deadriseAtTransom: string | null
  hullMaterial: string | null
  hullShape: string | null
  keelType: string | null
  freshWaterTank: string | null
  fuelTank: string | null
  holdingTank: string | null
  guestHeads: string | null
  sellerType: string | null
  listingType: string | null
  fullText: string | null
  rawFields: Record<string, string | string[]>
  warnings: string[]
}

export interface ScraperRunSummary {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  skippedExisting: number
  inserted: number
  updated: number
  visitedUrls: string[]
  warnings: string[]
  records: ScraperRunRecord[]
}

export interface ScraperJobSummary {
  id: number
  status: string
  startedAt: string
  completedAt: string | null
  boatsFound: number | null
  boatsScraped: number | null
  pagesVisited: number | null
  error: string | null
  summary: ScraperRunSummary | null
}

export interface ScraperPipelineRecord extends ScraperPipelineDraft {
  id: number
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  lastJob: ScraperJobSummary | null
}

export interface ScraperJobAuditEvent {
  id: number
  crawlJobId: number
  eventType: ScraperCrawlJobEventType
  status: string
  message: string | null
  pageNumber: number | null
  searchUrl: string | null
  payload: Record<string, JsonValue> | null
  createdAt: string
}

export interface ScraperJobAuditListing {
  id: number
  crawlJobId: number
  identityKey: string
  source: string
  listingId: string | null
  listingUrl: string | null
  detailUrl: string | null
  discoveredOnPage: number | null
  firstSeenAt: string
  lastUpdatedAt: string
  duplicateDecision: ScraperDuplicateDecision
  detailStatus: ScraperDetailStatus
  detailAttempts: number
  retryQueued: boolean
  persistenceStatus: ScraperPersistenceStatus
  persistedBoatId: number | null
  finalImageCount: number | null
  finalHasStructuredDetails: boolean
  weakFingerprint: boolean
  errorMessage: string | null
  warnings: string[]
  audit: Record<string, JsonValue> | null
}

export interface ScraperJobAuditListingFilters {
  duplicateDecision: ScraperDuplicateDecision | 'all'
  detailStatus: ScraperDetailStatus | 'all'
  persistenceStatus: ScraperPersistenceStatus | 'all'
  weakFingerprintOnly: boolean
  errorsOnly: boolean
  page: number
  pageSize: number
}

export interface ScraperJobAuditListPage {
  items: ScraperJobAuditListing[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export interface ScraperJobAuditOverview {
  totalListings: number
  duplicateSkipped: number
  weakRefreshes: number
  retriesQueued: number
  retriesCompleted: number
  persistenceFailed: number
  detailFailed: number
  stoppedListings: number
  weakFingerprintListings: number
}

export interface ScraperJobAuditDetail {
  job: ScraperJobSummary | null
  events: ScraperJobAuditEvent[]
  overview: ScraperJobAuditOverview
  listings: ScraperJobAuditListPage
  filters: ScraperJobAuditListingFilters
}

export function createDefaultScraperFieldRules(): ScraperFieldRule[] {
  return [
    {
      key: 'url',
      scope: 'item',
      selector: 'a',
      extract: 'attr',
      attribute: 'href',
      multiple: false,
      joinWith: '\n',
      transform: 'url',
      regex: '',
      required: true,
    },
    {
      key: 'title',
      scope: 'item',
      selector: 'a',
      extract: 'text',
      attribute: '',
      multiple: false,
      joinWith: '\n',
      transform: 'text',
      regex: '',
      required: true,
    },
    {
      key: 'price',
      scope: 'item',
      selector: '.price',
      extract: 'text',
      attribute: '',
      multiple: false,
      joinWith: '\n',
      transform: 'price',
      regex: '',
      required: false,
    },
    {
      key: 'location',
      scope: 'item',
      selector: '.location',
      extract: 'text',
      attribute: '',
      multiple: false,
      joinWith: '\n',
      transform: 'text',
      regex: '',
      required: false,
    },
    {
      key: 'images',
      scope: 'item',
      selector: 'img',
      extract: 'attr',
      attribute: 'src',
      multiple: true,
      joinWith: '\n',
      transform: 'url',
      regex: '',
      required: false,
    },
    {
      key: 'description',
      scope: 'detail',
      selector: 'meta[name="description"]',
      extract: 'attr',
      attribute: 'content',
      multiple: false,
      joinWith: '\n',
      transform: 'text',
      regex: '',
      required: false,
    },
  ]
}

export function createEmptyScraperPipelineDraft(): ScraperPipelineDraft {
  return {
    name: '',
    boatSource: '',
    description: '',
    active: true,
    config: {
      startUrls: [''],
      allowedDomains: [],
      itemSelector: '',
      nextPageSelector: '',
      detailFollowLinkSelector: '',
      maxPages: 1,
      maxItemsPerRun: 40,
      fetchDetailPages: true,
      detailBackfillMode: false,
      fields: createDefaultScraperFieldRules(),
    },
  }
}

export function listToMultiline(values: string[]) {
  return values.join('\n')
}

export function multilineToList(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '')
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return decodeURIComponent(escape(atob(normalized + padding)))
}

export function encodeScraperDraftForTransfer(draft: ScraperPipelineDraft) {
  return toBase64Url(JSON.stringify(scraperPipelineDraftSchema.parse(draft)))
}

export function decodeScraperDraftFromTransfer(value: string) {
  return scraperPipelineDraftSchema.parse(JSON.parse(fromBase64Url(value)))
}
