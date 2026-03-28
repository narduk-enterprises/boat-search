export const FIELD_KEYS = [
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

export const FIELD_SCOPES = ['item', 'detail'] as const
export const FIELD_EXTRACT_TYPES = ['text', 'attr', 'html'] as const
export const FIELD_TRANSFORMS = ['text', 'price', 'year', 'integer', 'url'] as const

export type ScraperFieldKey = (typeof FIELD_KEYS)[number]
export type ScraperFieldScope = (typeof FIELD_SCOPES)[number]
export type ScraperFieldExtractType = (typeof FIELD_EXTRACT_TYPES)[number]
export type ScraperFieldTransform = (typeof FIELD_TRANSFORMS)[number]
export type PageType = 'search' | 'detail' | 'unknown'
export type PickerKind = 'itemSelector' | 'nextPageSelector' | 'field'

export interface ScraperFieldRule {
  key: ScraperFieldKey
  scope: ScraperFieldScope
  selector: string
  extract: ScraperFieldExtractType
  attribute: string
  multiple: boolean
  joinWith: string
  transform: ScraperFieldTransform
  regex: string
  required: boolean
}

export interface ScraperPipelineDraft {
  name: string
  boatSource: string
  description: string
  active: boolean
  config: {
    startUrls: string[]
    allowedDomains: string[]
    itemSelector: string
    nextPageSelector: string
    maxPages: number
    maxItemsPerRun: number
    fetchDetailPages: boolean
    fields: ScraperFieldRule[]
  }
}

export interface AutoDetectedAnalysis {
  pageType: PageType
  siteName: string
  pageUrl: string
  itemSelector: string
  nextPageSelector: string
  sampleDetailUrl: string | null
  fields: ScraperFieldRule[]
  warnings: string[]
}

export interface PickerRequest {
  kind: PickerKind
  fieldKey?: ScraperFieldKey
  scope?: ScraperFieldScope
  itemSelector?: string
}

export interface PickerResult {
  kind: PickerKind
  fieldKey?: ScraperFieldKey
  scope?: ScraperFieldScope
  selector: string
  extract: ScraperFieldExtractType
  attribute: string
  sampleValue: string
  selectionCount?: number
  matchCount?: number
}

export interface FieldPreviewRequest {
  field: ScraperFieldRule
  itemSelector: string
  mode?: 'field' | 'itemSelector'
}

export interface FieldPreviewResult {
  selector: string
  matchCount: number
  highlightedCount: number
  sampleValues: string[]
}

export interface BrowserScrapeRecord {
  source: string
  url: string | null
  listingId: string | null
  title: string | null
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
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  fullText: string | null
  rawFields: Record<string, string | string[]>
  warnings: string[]
}

export interface SearchPageExtractRequest {
  draft: ScraperPipelineDraft
}

export interface SearchPageExtractResponse {
  pageUrl: string
  itemCount: number
  nextPageUrl: string | null
  records: BrowserScrapeRecord[]
  warnings: string[]
}

export interface DetailPageExtractRequest {
  draft: ScraperPipelineDraft
}

export interface DetailPageExtractResponse {
  pageUrl: string
  record: Partial<BrowserScrapeRecord>
  warnings: string[]
}

export interface BrowserScrapeSummary {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  visitedUrls: string[]
  warnings: string[]
}

export interface BrowserScrapeProgress {
  stage: 'search' | 'detail' | 'upload'
  currentUrl: string | null
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  detailPagesCompleted: number
  detailPagesTotal: number
  recordsPersisted: number
  imagesUploaded: number
}

export interface ExtensionConnection {
  apiKey: string
  verifiedAt: string | null
  verifiedEmail: string | null
  verifiedName: string | null
  imageUploadEnabled: boolean
}

export interface ExtensionAuthStatusResponse {
  authenticated: true
  user: {
    id: string
    email: string
    name: string | null
  }
  imageUploadEnabled: boolean
  uploadEndpoint: string
}

export interface ExtensionRunStartResponse {
  pipelineId: number
  jobId: number
  startedAt: string
}

export interface ExtensionRunRecordResponse {
  inserted: number
  updated: number
  warnings: string[]
}

export interface ExtensionRunCompleteResponse {
  jobId: number
  summary: {
    pagesVisited: number
    itemsSeen: number
    itemsExtracted: number
    inserted: number
    updated: number
    visitedUrls: string[]
    warnings: string[]
  }
}

export interface PickerProgress {
  kind: PickerKind
  selectionCount: number
  selector: string
  matchCount: number
  ready: boolean
}

export interface ExtensionSession {
  appBaseUrl: string
  connection: ExtensionConnection
  currentTabUrl: string | null
  stage: 'search' | 'detail'
  sampleDetailUrl: string | null
  lastAnalysis: AutoDetectedAnalysis | null
  draft: ScraperPipelineDraft
}

export type ContentMessage =
  | { type: 'EXTENSION_ANALYZE_PAGE' }
  | { type: 'EXTENSION_START_PICKER'; picker: PickerRequest }
  | { type: 'EXTENSION_PREVIEW_FIELD'; preview: FieldPreviewRequest }
  | { type: 'EXTENSION_EXTRACT_SEARCH_PAGE'; request: SearchPageExtractRequest }
  | { type: 'EXTENSION_EXTRACT_DETAIL_PAGE'; request: DetailPageExtractRequest }
  | { type: 'EXTENSION_CLEAR_PREVIEW' }
  | { type: 'EXTENSION_STOP_PICKER' }

export type BackgroundMessage =
  | { type: 'EXTENSION_OPEN_URL'; url: string }
  | { type: 'EXTENSION_PICKER_RESULT'; result: PickerResult }
  | { type: 'EXTENSION_PICKER_PROGRESS'; progress: PickerProgress }
  | { type: 'EXTENSION_PICKER_CANCELLED'; kind: PickerKind }
