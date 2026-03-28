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

export const SCRAPER_FIELD_SCOPES = ['item', 'detail'] as const
export const SCRAPER_FIELD_EXTRACT_TYPES = ['text', 'attr', 'html'] as const
export const SCRAPER_FIELD_TRANSFORMS = ['text', 'price', 'year', 'integer', 'url'] as const

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
    maxPages: z.number().int().min(1).max(25).default(1),
    maxItemsPerRun: z.number().int().min(1).max(250).default(50),
    fetchDetailPages: z.boolean().default(false),
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
      config.fields.some((field) => field.scope === 'detail') &&
      config.fetchDetailPages === false
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Turn on detail-page fetching when any rule targets detail scope.',
        path: ['fetchDetailPages'],
      })
    }
  })

export const scraperPipelineDraftSchema = z.object({
  name: z.string().trim().min(1, 'Pipeline name is required').max(120),
  boatSource: z.string().trim().min(1, 'Boat source is required').max(80),
  description: z.string().trim().max(500).default(''),
  active: z.boolean().default(true),
  config: scraperPipelineConfigSchema,
})

export const scraperPipelineMutationSchema = scraperPipelineDraftSchema
export const scraperPipelinePreviewSchema = scraperPipelineDraftSchema

const scraperBrowserFieldValueSchema = z.union([z.string(), z.array(z.string())])

export const scraperBrowserRunRecordSchema = z.object({
  source: z.string().trim().min(1).max(80),
  url: z.string().url().nullable(),
  listingId: z.string().trim().nullable(),
  title: z.string().trim().nullable(),
  make: z.string().trim().nullable(),
  model: z.string().trim().nullable(),
  year: z.number().int().nullable(),
  length: z.string().trim().nullable(),
  price: z.string().trim().nullable(),
  currency: z.string().trim().nullable(),
  location: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  state: z.string().trim().nullable(),
  country: z.string().trim().nullable(),
  description: z.string().trim().nullable(),
  sellerType: z.string().trim().nullable(),
  listingType: z.string().trim().nullable(),
  images: z.array(z.string().url()).default([]),
  fullText: z.string().trim().nullable(),
  rawFields: z.record(z.string(), scraperBrowserFieldValueSchema).default({}),
  warnings: z.array(z.string()).default([]),
})

export const scraperBrowserRunSummarySchema = z.object({
  pagesVisited: z.number().int().min(0),
  itemsSeen: z.number().int().min(0),
  itemsExtracted: z.number().int().min(0),
  visitedUrls: z.array(z.string().url()).default([]),
  warnings: z.array(z.string()).default([]),
})

export const scraperPipelineBrowserRunSchema = z.object({
  draft: scraperPipelineDraftSchema,
  records: z.array(scraperBrowserRunRecordSchema),
  summary: scraperBrowserRunSummarySchema,
})

export type ScraperFieldRule = z.infer<typeof scraperFieldSchema>
export type ScraperPipelineConfig = z.infer<typeof scraperPipelineConfigSchema>
export type ScraperPipelineDraft = z.infer<typeof scraperPipelineDraftSchema>
export type ScraperBrowserRunRecord = z.infer<typeof scraperBrowserRunRecordSchema>
export type ScraperBrowserRunSummary = z.infer<typeof scraperBrowserRunSummarySchema>

export interface ScraperRunRecord {
  url: string | null
  title: string | null
  listingId: string | null
  make: string | null
  model: string | null
  year: number | null
  price: string | null
  location: string | null
  images: string[]
  description: string | null
  rawFields: Record<string, string | string[]>
  warnings: string[]
}

export interface ScraperRunSummary {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
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
      maxPages: 1,
      maxItemsPerRun: 40,
      fetchDetailPages: true,
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
