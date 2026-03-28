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

export interface PickerProgress {
  kind: PickerKind
  selectionCount: number
  selector: string
  matchCount: number
  ready: boolean
}

export interface ExtensionSession {
  appBaseUrl: string
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
  | { type: 'EXTENSION_CLEAR_PREVIEW' }
  | { type: 'EXTENSION_STOP_PICKER' }

export type BackgroundMessage =
  | { type: 'EXTENSION_OPEN_URL'; url: string }
  | { type: 'EXTENSION_PICKER_RESULT'; result: PickerResult }
  | { type: 'EXTENSION_PICKER_PROGRESS'; progress: PickerProgress }
  | { type: 'EXTENSION_PICKER_CANCELLED'; kind: PickerKind }
