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

export const FIELD_SCOPES = ['item', 'detail', 'detail-follow'] as const
export const FIELD_EXTRACT_TYPES = ['text', 'attr', 'html'] as const
export const FIELD_TRANSFORMS = ['text', 'price', 'year', 'integer', 'url'] as const

export type ScraperFieldKey = (typeof FIELD_KEYS)[number]
export type ScraperFieldScope = (typeof FIELD_SCOPES)[number]
export type ScraperFieldExtractType = (typeof FIELD_EXTRACT_TYPES)[number]
export type ScraperFieldTransform = (typeof FIELD_TRANSFORMS)[number]
export type PageType = 'search' | 'detail' | 'unknown'
export type AnalysisPageState = 'ok' | 'challenge' | 'no_results' | 'parser_changed'
export type PickerKind = 'itemSelector' | 'nextPageSelector' | 'field'
export type SitePresetId = 'boats-com-search' | 'yachtworld-search'
export type SitePresetPageContext = 'search' | 'detail'
export type SitePresetApplicationMode = 'auto' | 'manual'
export type ExtensionTabTargetMode = 'follow-active' | 'locked'
export type FixtureCaptureTemplate = 'detail-ok' | 'detail-gallery-noise'
export type SessionValueSource = 'manual' | 'local-default' | null

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
    detailFollowLinkSelector: string
    maxPages: number
    maxItemsPerRun: number
    fetchDetailPages: boolean
    /** When true, `startUrls` are YachtWorld detail URLs only (no search pagination). */
    detailBackfillMode: boolean
    fields: ScraperFieldRule[]
  }
}

export interface AutoDetectedAnalysis {
  pageType: PageType
  pageState: AnalysisPageState
  stateMessage: string | null
  siteName: string
  pageUrl: string
  itemSelector: string
  nextPageSelector: string
  sampleDetailUrl: string | null
  fields: ScraperFieldRule[]
  warnings: string[]
  stats: {
    detailLinkCount: number
    listingCardCount: number
    distinctImageCount: number
  }
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
  contactInfo?: string | null
  contactName?: string | null
  contactPhone?: string | null
  otherDetails?: string | null
  disclaimer?: string | null
  features?: string | null
  electricalEquipment?: string | null
  electronics?: string | null
  insideEquipment?: string | null
  outsideEquipment?: string | null
  additionalEquipment?: string | null
  propulsion?: string | null
  engineMake?: string | null
  engineModel?: string | null
  engineYearDetail?: string | null
  totalPower?: string | null
  engineHours?: string | null
  engineTypeDetail?: string | null
  driveType?: string | null
  fuelTypeDetail?: string | null
  propellerType?: string | null
  propellerMaterial?: string | null
  specifications?: string | null
  cruisingSpeed?: string | null
  maxSpeed?: string | null
  range?: string | null
  lengthOverall?: string | null
  maxBridgeClearance?: string | null
  maxDraft?: string | null
  minDraftDetail?: string | null
  beamDetail?: string | null
  dryWeight?: string | null
  windlass?: string | null
  electricalCircuit?: string | null
  deadriseAtTransom?: string | null
  hullMaterial?: string | null
  hullShape?: string | null
  keelType?: string | null
  freshWaterTank?: string | null
  fuelTank?: string | null
  holdingTank?: string | null
  guestHeads?: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  fullText: string | null
  rawFields: Record<string, string | string[]>
  warnings: string[]
}

export interface SearchPageExtractRequest {
  draft: ScraperPipelineDraft
  presetId?: SitePresetId | null
}

export interface SearchPageExtractResponse {
  analysis: AutoDetectedAnalysis
  pageUrl: string
  itemCount: number
  nextPageUrl: string | null
  records: BrowserScrapeRecord[]
  warnings: string[]
}

export interface DetailPageExtractRequest {
  draft: ScraperPipelineDraft
  presetId?: SitePresetId | null
  scope?: 'detail' | 'detail-follow'
}

export interface DetailPageExtractResponse {
  analysis: AutoDetectedAnalysis
  pageUrl: string
  record: Partial<BrowserScrapeRecord>
  followPageUrl?: string | null
  warnings: string[]
}

export interface BrowserScrapeSummary {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  skippedExisting: number
  visitedUrls: string[]
  warnings: string[]
}

export interface BrowserScrapeProgress {
  stage: 'search' | 'detail' | 'detail_backfill' | 'upload'
  currentUrl: string | null
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  skippedExisting: number
  detailPagesCompleted: number
  detailPagesTotal: number
  recordsPersisted: number
  imagesUploaded: number
}

export type ExtensionDuplicateDecision = 'new' | 'known_duplicate_skipped' | 'weak_existing_refresh'

export type ExtensionDetailStatus =
  | 'not_attempted'
  | 'queued'
  | 'scraped'
  | 'retry_queued'
  | 'retry_scraped'
  | 'failed'
  | 'stopped'

export interface ExtensionRunListingAudit {
  runId: number
  identityKey: string
  source: string
  listingId: string | null
  listingUrl: string | null
  detailUrl: string | null
  pageNumber: number | null
  duplicateDecision: ExtensionDuplicateDecision
  detailStatus: ExtensionDetailStatus
  detailAttempts: number
  retryQueued: boolean
  weakFingerprint: boolean
  finalImageCount: number | null
  finalHasStructuredDetails: boolean
  error: string | null
  warnings: string[]
  auditJson?: Record<string, unknown>
}

export type SampleDetailRunStatus = 'opening' | 'opened' | 'scanned' | 'error'

export interface SampleDetailRunState {
  status: SampleDetailRunStatus
  url: string | null
  fieldCount: number
  imageCount: number
  message: string
}

export interface FixtureCaptureViewport {
  width: number
  height: number
  scrollX: number
  scrollY: number
  scrollWidth: number
  scrollHeight: number
  clientWidth: number
  clientHeight: number
}

export interface FixtureCaptureRequest {
  template: FixtureCaptureTemplate
}

export interface FixtureCaptureResponse {
  html: string
  analysis: AutoDetectedAnalysis
  page: {
    url: string
    title: string
    readyState: string
    viewport: FixtureCaptureViewport
  }
}

export type BrowserDetailArtifactRole = 'detail' | 'detail-follow'

export interface BrowserDetailArtifactPage extends FixtureCaptureResponse {
  role: BrowserDetailArtifactRole
}

export interface BrowserDetailArtifact {
  capturedAt: string
  pages: BrowserDetailArtifactPage[]
}

export interface ExtensionDebugEvent {
  type: string
  at: string
  message: string
  detail?: Record<string, unknown>
}

export interface ExtensionDebugSnapshot {
  statusMessage: string
  errorMessage: string
  currentTabUrl: string | null
  tabTarget: ExtensionTabTarget
  analysis: AutoDetectedAnalysis | null
  preset: ExtensionPresetState
  connection: {
    apiKeySource: SessionValueSource
    appBaseUrlSource: SessionValueSource
    verifiedEmail: string | null
    imageUploadEnabled: boolean
  }
  browserSettings: ExtensionBrowserSettings
  sampleDetailRun: SampleDetailRunState | null
  browserRunProgress: BrowserScrapeProgress | null
  remoteRun: {
    pipelineId: number
    jobId: number | null
    summary: BrowserScrapeSummary & {
      inserted: number
      updated: number
    }
  } | null
  draft: ScraperPipelineDraft
  events: ExtensionDebugEvent[]
}

export interface ExtensionConnection {
  apiKey: string
  apiKeySource: SessionValueSource
  verifiedAt: string | null
  verifiedEmail: string | null
  verifiedName: string | null
  imageUploadEnabled: boolean
}

export interface ExtensionBrowserSettings {
  detailTabConcurrency: number
}

export interface ExtensionPresetState {
  matchedPresetId: SitePresetId | null
  matchedPresetLabel: string | null
  matchedContext: SitePresetPageContext | null
  appliedPresetId: SitePresetId | null
  appliedPresetLabel: string | null
  appliedForUrl: string | null
  applicationMode: SitePresetApplicationMode | null
  appliedDraftFingerprint: string | null
  isDraftDirty: boolean
}

export interface ExtensionTabTarget {
  mode: ExtensionTabTargetMode
  tabId: number | null
  windowId: number | null
  url: string | null
  title: string | null
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

export interface ExtensionKnownBoatIdentities {
  listingIds: string[]
  normalizedUrls: string[]
}

export interface ExtensionRunStartResponse {
  pipelineId: number
  jobId: number
  startedAt: string
  existingBoatIdentities: ExtensionKnownBoatIdentities
  refreshableBoatIdentities: ExtensionKnownBoatIdentities
}

export interface ExtensionRunRecordResponse {
  inserted: number
  updated: number
  boatId: number | null
  persistenceStatus: 'inserted' | 'updated' | 'unchanged' | 'failed'
  imagesUploaded: number
  warnings: string[]
}

export interface ExtensionRunListingResponse {
  ok: true
}

export interface ExtensionRunProgressResponse {
  jobId: number
  summary: {
    pagesVisited: number
    itemsSeen: number
    itemsExtracted: number
    skippedExisting: number
    inserted: number
    updated: number
    visitedUrls: string[]
    warnings: string[]
  }
}

export interface ExtensionRunCompleteResponse {
  jobId: number
  summary: {
    pagesVisited: number
    itemsSeen: number
    itemsExtracted: number
    skippedExisting: number
    inserted: number
    updated: number
    visitedUrls: string[]
    warnings: string[]
  }
}

export interface ExtensionRunStopResponse {
  ok: true
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
  appBaseUrlSource: SessionValueSource
  connection: ExtensionConnection
  browserSettings: ExtensionBrowserSettings
  tabTarget: ExtensionTabTarget
  currentTabUrl: string | null
  stage: 'search' | 'detail'
  sampleDetailUrl: string | null
  lastAnalysis: AutoDetectedAnalysis | null
  preset: ExtensionPresetState
  draft: ScraperPipelineDraft
}

export type ContentMessage =
  | { type: 'EXTENSION_ANALYZE_PAGE' }
  | { type: 'EXTENSION_CAPTURE_PAGE'; request: FixtureCaptureRequest }
  | { type: 'EXTENSION_START_PICKER'; picker: PickerRequest }
  | { type: 'EXTENSION_PREVIEW_FIELD'; preview: FieldPreviewRequest }
  | { type: 'EXTENSION_EXTRACT_SEARCH_PAGE'; request: SearchPageExtractRequest }
  | { type: 'EXTENSION_EXTRACT_DETAIL_PAGE'; request: DetailPageExtractRequest }
  | { type: 'EXTENSION_CLEAR_PREVIEW' }
  | { type: 'EXTENSION_STOP_PICKER' }

export type BackgroundMessage =
  | { type: 'EXTENSION_OPEN_URL'; url: string }
  | {
      type: 'EXTENSION_DOWNLOAD_FILE'
      fileName: string
      url: string
      saveAs?: boolean
    }
  | { type: 'EXTENSION_PICKER_RESULT'; result: PickerResult }
  | { type: 'EXTENSION_PICKER_PROGRESS'; progress: PickerProgress }
  | { type: 'EXTENSION_PICKER_CANCELLED'; kind: PickerKind }
