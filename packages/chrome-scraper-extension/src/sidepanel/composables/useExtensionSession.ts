import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  createDefaultSession,
  createFieldRule,
  MAX_BROWSER_SCRAPE_MAX_ITEMS_PER_RUN,
  MAX_BROWSER_SCRAPE_MAX_PAGES,
} from '@/shared/defaults'
import {
  buildFixtureCaptureFileNames,
  buildFixtureCaptureFileStem,
  buildFixtureCaptureMetadata,
  evaluateFixtureCaptureTemplate,
  normalizeFixtureCaptureSessionState,
  resolveFixtureLabel,
} from '@/shared/fixtureCapture'
import {
  buildPresetDraft,
  buildPresetDraftFingerprint,
  buildRuntimePresetDraft,
  canAutoApplySitePreset,
  describePresetApplication,
  findMatchingSitePreset,
  getSitePresetLabel,
  isTrustedPresetId,
  normalizePresetRecord,
  extractListingIdFromUrl,
} from '@/shared/sitePresets'
import {
  consumeRefreshableBoatIdentity,
  createBrowserRunIdentityState,
  hasKnownBoatIdentity,
  rememberBoatIdentity,
} from '@/shared/sourceIdentity'
import { buildImportUrl } from '@/shared/transfer'
import {
  applyAnalysisToSession,
  buildClearedScrapeSession,
  buildAnalysisStatusMessage,
  buildSessionWithoutConnection,
  createDebugEvent,
  createSampleDetailRunState,
  isTrustedPresetReady,
  shouldContinueBrowserSearchPagination,
} from '@/sidepanel/state/sessionState'
import { cloneSerializableValue } from '@/sidepanel/utils/cloneSerializableValue'
import {
  applySessionValueDefaults,
  getBuildSessionDefaults,
} from '@/sidepanel/utils/buildSessionDefaults'
import type {
  AutoDetectedAnalysis,
  ExtensionDebugEvent,
  ExtensionDebugSnapshot,
  BackgroundMessage,
  BrowserScrapeProgress,
  BrowserScrapeRecord,
  BrowserScrapeSummary,
  DetailPageExtractResponse,
  ExtensionDetailStatus,
  ExtensionAuthStatusResponse,
  FixtureCaptureResponse,
  FixtureCaptureSummary,
  FixtureCaptureTemplate,
  ExtensionRunCompleteResponse,
  ExtensionRunListingAudit,
  ExtensionRunListingResponse,
  ExtensionRunProgressResponse,
  ExtensionRunRecordResponse,
  ExtensionRunStartResponse,
  ExtensionRunStopResponse,
  FieldPreviewResult,
  SearchPageExtractResponse,
  PickerProgress,
  PickerRequest,
  PickerResult,
  ScraperFieldRule,
  ScraperFieldScope,
  ScraperPipelineDraft,
  SitePresetApplicationMode,
  SitePresetId,
  ExtensionSession,
  ExtensionPresetState,
  SampleDetailRunState,
  SessionValueSource,
} from '@/shared/types'

const STORAGE_KEY = 'boat-search-extension-session-v3'

/** Heavy search SPAs (e.g. YachtWorld) may not reach `tabs.status === complete` quickly. */
const SEARCH_PAGE_NAV_TIMEOUT_MS = 90_000
const DETAIL_PAGE_NAV_TIMEOUT_MS = 45_000

type FieldPreviewState = FieldPreviewResult & {
  field: ScraperFieldRule
  fieldId: string
  status: 'loading' | 'ready' | 'error'
  error: string
}

type ItemSelectorTrainingState = PickerProgress | null

type ItemSelectorPreviewState =
  | (FieldPreviewResult & {
      active: boolean
      error: string
    })
  | null

type RemoteRunSummary = {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  skippedExisting: number
  visitedUrls: string[]
  inserted: number
  updated: number
  warnings: string[]
}

type RemoteRunState = {
  pipelineId: number
  jobId: number | null
  summary: RemoteRunSummary
} | null

type ActiveRemoteRunMeta = {
  pipelineId: number
  jobId: number
} | null

type ActiveBrowserRunController = {
  stopRequested: boolean
}

const BROWSER_RUN_STOP_MESSAGE = 'Browser scrape stopped by user.'

class BrowserRunStoppedError extends Error {
  constructor() {
    super(BROWSER_RUN_STOP_MESSAGE)
    this.name = 'BrowserRunStoppedError'
  }
}

function isBrowserRunStoppedError(error: unknown): error is BrowserRunStoppedError {
  return error instanceof BrowserRunStoppedError || (
    error instanceof Error &&
    error.message === BROWSER_RUN_STOP_MESSAGE
  )
}

type BrowserRunProgressState = BrowserScrapeProgress | null
type SampleDetailRunRefState = SampleDetailRunState | null
type FixtureCaptureOverrideState = {
  template: FixtureCaptureTemplate
  message: string
} | null

const MAX_DEBUG_EVENTS = 120

type ExtensionWindow = Window & {
  __BOAT_SEARCH_EXTENSION_DEBUG__?: ExtensionDebugSnapshot
}

class BoatSearchRequestError extends Error {
  method: string
  path: string
  status: number | null
  phase: 'network' | 'response'

  constructor(
    message: string,
    options: {
      method: string
      path: string
      status?: number | null
      phase: 'network' | 'response'
    },
  ) {
    super(message)
    this.name = 'BoatSearchRequestError'
    this.method = options.method
    this.path = options.path
    this.status = options.status ?? null
    this.phase = options.phase
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function isBoatSearchRequestError(error: unknown): error is BoatSearchRequestError {
  return error instanceof BoatSearchRequestError
}

function normalizeSessionValueSource(value: unknown): SessionValueSource {
  return value === 'manual' || value === 'local-default' ? value : null
}

function makeFieldId(field: Pick<ScraperFieldRule, 'key' | 'scope'>) {
  return `${field.scope}:${field.key}`
}

function isWebPageUrl(url: string | undefined) {
  return Boolean(url && /^https?:\/\//i.test(url))
}

function isAllowedDomainUrl(url: string, allowedDomains: string[]) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const normalizedDomains = allowedDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean)

    return normalizedDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  } catch {
    return false
  }
}

function hasMissingReceiverError(error: unknown) {
  return (
    error instanceof Error &&
    /receiving end does not exist|could not establish connection/i.test(error.message)
  )
}

async function readErrorMessage(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as {
        statusMessage?: string
        message?: string
        error?: { statusMessage?: string; message?: string }
      }

      return (
        payload.statusMessage ||
        payload.message ||
        payload.error?.statusMessage ||
        payload.error?.message ||
        `Request failed with ${response.status}.`
      )
    } catch {
      return `Request failed with ${response.status}.`
    }
  }

  const text = await response.text()
  return text.trim() || `Request failed with ${response.status}.`
}

function getBoatSearchBaseUrl(sessionValue: ExtensionSession) {
  return sessionValue.appBaseUrl.trim().replace(/\/+$/g, '')
}

function sanitizeFileStem(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatCsvTimestamp() {
  const now = new Date()
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ]

  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`
}

function resolveBrowserScrapeRuntimeConfig(
  sessionValue: ExtensionSession,
  draft: ScraperPipelineDraft,
) {
  const appliedPresetId = isTrustedPresetId(sessionValue.preset.appliedPresetId)
    ? sessionValue.preset.appliedPresetId
    : null
  if (appliedPresetId) {
    return {
      draft,
      presetId: appliedPresetId,
      usedRuntimePresetOverride: false,
    }
  }

  const matchedPresetId = isTrustedPresetId(sessionValue.preset.matchedPresetId)
    ? sessionValue.preset.matchedPresetId
    : null
  if (!matchedPresetId) {
    return {
      draft,
      presetId: null,
      usedRuntimePresetOverride: false,
    }
  }

  const pageUrl =
    draft.config.startUrls.find((entry) => entry.trim())?.trim() ||
    sessionValue.currentTabUrl?.trim() ||
    ''
  if (!pageUrl) {
    return {
      draft,
      presetId: matchedPresetId,
      usedRuntimePresetOverride: false,
    }
  }

  return {
    draft: buildRuntimePresetDraft(draft, matchedPresetId, pageUrl),
    presetId: matchedPresetId,
    usedRuntimePresetOverride: true,
  }
}

function escapeCsvCell(value: unknown) {
  const normalized = Array.isArray(value)
    ? value.join(' | ')
    : value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`
  }

  return normalized
}

function createBoatSearchHeaders(sessionValue: ExtensionSession, extraHeaders: HeadersInit = {}) {
  const apiKey = sessionValue.connection.apiKey.trim()
  if (!apiKey) {
    throw new Error('Add a Boat Search API key before starting a browser scrape.')
  }

  return {
    Accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-Requested-With': 'XMLHttpRequest',
    ...extraHeaders,
  }
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return []
}

function toBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max)
}

function normalizeField(field: unknown, fallback: ScraperFieldRule) {
  if (!field || typeof field !== 'object') {
    return fallback
  }

  const raw = field as Partial<ScraperFieldRule>
  return {
    ...fallback,
    ...raw,
    selector: typeof raw.selector === 'string' ? raw.selector : fallback.selector,
    attribute: typeof raw.attribute === 'string' ? raw.attribute : fallback.attribute,
    joinWith: typeof raw.joinWith === 'string' ? raw.joinWith : fallback.joinWith,
    regex: typeof raw.regex === 'string' ? raw.regex : fallback.regex,
    multiple: typeof raw.multiple === 'boolean' ? raw.multiple : fallback.multiple,
    required: typeof raw.required === 'boolean' ? raw.required : fallback.required,
  }
}

function normalizeDraft(draft: unknown, fallback: ScraperPipelineDraft): ScraperPipelineDraft {
  if (!draft || typeof draft !== 'object') {
    return structuredClone(fallback)
  }

  const raw = draft as Partial<ScraperPipelineDraft>
  const rawConfig: Partial<ScraperPipelineDraft['config']> =
    raw.config && typeof raw.config === 'object' ? raw.config : {}

  return {
    ...structuredClone(fallback),
    ...raw,
    name: typeof raw.name === 'string' ? raw.name : fallback.name,
    boatSource: typeof raw.boatSource === 'string' ? raw.boatSource : fallback.boatSource,
    description: typeof raw.description === 'string' ? raw.description : fallback.description,
    active: typeof raw.active === 'boolean' ? raw.active : fallback.active,
    config: {
      ...structuredClone(fallback.config),
      ...rawConfig,
      startUrls: toStringArray(rawConfig.startUrls),
      allowedDomains: toStringArray(rawConfig.allowedDomains),
      detailFollowLinkSelector:
        typeof rawConfig.detailFollowLinkSelector === 'string'
          ? rawConfig.detailFollowLinkSelector
          : fallback.config.detailFollowLinkSelector,
      maxPages: toBoundedInteger(
        rawConfig.maxPages,
        fallback.config.maxPages,
        1,
        MAX_BROWSER_SCRAPE_MAX_PAGES,
      ),
      maxItemsPerRun: toBoundedInteger(
        rawConfig.maxItemsPerRun,
        fallback.config.maxItemsPerRun,
        1,
        MAX_BROWSER_SCRAPE_MAX_ITEMS_PER_RUN,
      ),
      fetchDetailPages:
        typeof rawConfig.fetchDetailPages === 'boolean'
          ? rawConfig.fetchDetailPages
          : fallback.config.fetchDetailPages,
      detailBackfillMode:
        typeof rawConfig.detailBackfillMode === 'boolean'
          ? rawConfig.detailBackfillMode
          : fallback.config.detailBackfillMode,
      fields: Array.isArray(rawConfig.fields)
        ? rawConfig.fields.map((field: unknown, index: number) =>
            normalizeField(field, fallback.config.fields[index] ?? fallback.config.fields[0]),
          )
        : structuredClone(fallback.config.fields),
    },
  }
}

function normalizePresetState(
  value: unknown,
  fallback: ExtensionPresetState,
): ExtensionPresetState {
  if (!value || typeof value !== 'object') {
    return structuredClone(fallback)
  }

  const raw = value as Partial<ExtensionPresetState>
  const matchedPresetId = raw.matchedPresetId === 'yachtworld-search' ? raw.matchedPresetId : null
  const appliedPresetId = raw.appliedPresetId === 'yachtworld-search' ? raw.appliedPresetId : null

  return {
    ...fallback,
    ...raw,
    matchedPresetId,
    matchedPresetLabel:
      typeof raw.matchedPresetLabel === 'string'
        ? raw.matchedPresetLabel
        : getSitePresetLabel(matchedPresetId),
    matchedContext:
      raw.matchedContext === 'detail' || raw.matchedContext === 'search'
        ? raw.matchedContext
        : null,
    appliedPresetId,
    appliedPresetLabel:
      typeof raw.appliedPresetLabel === 'string'
        ? raw.appliedPresetLabel
        : getSitePresetLabel(appliedPresetId),
    appliedForUrl: typeof raw.appliedForUrl === 'string' ? raw.appliedForUrl : null,
    applicationMode:
      raw.applicationMode === 'auto' || raw.applicationMode === 'manual'
        ? raw.applicationMode
        : null,
    appliedDraftFingerprint:
      typeof raw.appliedDraftFingerprint === 'string' ? raw.appliedDraftFingerprint : null,
    isDraftDirty: typeof raw.isDraftDirty === 'boolean' ? raw.isDraftDirty : false,
  }
}

function normalizeSession(value: unknown, fallback: ExtensionSession): ExtensionSession {
  if (!value || typeof value !== 'object') {
    return structuredClone(fallback)
  }

  const raw = value as Partial<ExtensionSession>
  return {
    ...fallback,
    ...raw,
    appBaseUrl: typeof raw.appBaseUrl === 'string' ? raw.appBaseUrl : fallback.appBaseUrl,
    appBaseUrlSource: normalizeSessionValueSource(raw.appBaseUrlSource),
    connection:
      raw.connection && typeof raw.connection === 'object'
        ? {
            ...fallback.connection,
            ...raw.connection,
            apiKey:
              typeof raw.connection.apiKey === 'string'
                ? raw.connection.apiKey.trim()
                : fallback.connection.apiKey,
            apiKeySource: normalizeSessionValueSource(raw.connection.apiKeySource),
            verifiedAt:
              typeof raw.connection.verifiedAt === 'string'
                ? raw.connection.verifiedAt
                : fallback.connection.verifiedAt,
            verifiedEmail:
              typeof raw.connection.verifiedEmail === 'string'
                ? raw.connection.verifiedEmail
                : fallback.connection.verifiedEmail,
            verifiedName:
              typeof raw.connection.verifiedName === 'string'
                ? raw.connection.verifiedName
                : fallback.connection.verifiedName,
            imageUploadEnabled:
              typeof raw.connection.imageUploadEnabled === 'boolean'
                ? raw.connection.imageUploadEnabled
                : fallback.connection.imageUploadEnabled,
          }
        : structuredClone(fallback.connection),
    currentTabUrl: typeof raw.currentTabUrl === 'string' ? raw.currentTabUrl : null,
    stage: raw.stage === 'detail' ? 'detail' : 'search',
    sampleDetailUrl: typeof raw.sampleDetailUrl === 'string' ? raw.sampleDetailUrl : null,
    preset: normalizePresetState(raw.preset, fallback.preset),
    fixtureCapture: normalizeFixtureCaptureSessionState(
      raw.fixtureCapture,
      fallback.fixtureCapture,
    ),
    draft: normalizeDraft(raw.draft, fallback.draft),
    lastAnalysis:
      raw.lastAnalysis && typeof raw.lastAnalysis === 'object'
        ? {
            ...raw.lastAnalysis,
            pageType:
              raw.lastAnalysis.pageType === 'detail' || raw.lastAnalysis.pageType === 'unknown'
                ? raw.lastAnalysis.pageType
                : 'search',
            pageState:
              raw.lastAnalysis.pageState === 'challenge' ||
              raw.lastAnalysis.pageState === 'no_results' ||
              raw.lastAnalysis.pageState === 'parser_changed'
                ? raw.lastAnalysis.pageState
                : 'ok',
            stateMessage:
              typeof raw.lastAnalysis.stateMessage === 'string'
                ? raw.lastAnalysis.stateMessage
                : null,
            siteName:
              typeof raw.lastAnalysis.siteName === 'string' ? raw.lastAnalysis.siteName : '',
            pageUrl: typeof raw.lastAnalysis.pageUrl === 'string' ? raw.lastAnalysis.pageUrl : '',
            itemSelector:
              typeof raw.lastAnalysis.itemSelector === 'string'
                ? raw.lastAnalysis.itemSelector
                : '',
            nextPageSelector:
              typeof raw.lastAnalysis.nextPageSelector === 'string'
                ? raw.lastAnalysis.nextPageSelector
                : '',
            sampleDetailUrl:
              typeof raw.lastAnalysis.sampleDetailUrl === 'string'
                ? raw.lastAnalysis.sampleDetailUrl
                : null,
            warnings: toStringArray(raw.lastAnalysis.warnings),
            stats:
              raw.lastAnalysis.stats && typeof raw.lastAnalysis.stats === 'object'
                ? {
                    detailLinkCount: toBoundedInteger(
                      raw.lastAnalysis.stats.detailLinkCount,
                      0,
                      0,
                      10_000,
                    ),
                    listingCardCount: toBoundedInteger(
                      raw.lastAnalysis.stats.listingCardCount,
                      0,
                      0,
                      10_000,
                    ),
                    distinctImageCount: toBoundedInteger(
                      raw.lastAnalysis.stats.distinctImageCount,
                      0,
                      0,
                      10_000,
                    ),
                  }
                : {
                    detailLinkCount: 0,
                    listingCardCount: 0,
                    distinctImageCount: 0,
                  },
            fields: Array.isArray(raw.lastAnalysis.fields)
              ? raw.lastAnalysis.fields.map((field, index) =>
                  normalizeField(
                    field,
                    fallback.draft.config.fields[index] ?? fallback.draft.config.fields[0],
                  ),
                )
              : [],
          }
        : null,
  }
}

export function useExtensionSession() {
  const configuredSessionDefaults = getBuildSessionDefaults()
  const createConfiguredDefaultSession = () => createDefaultSession(configuredSessionDefaults)

  const session = ref(createConfiguredDefaultSession())
  const activeTab = shallowRef<chrome.tabs.Tab | null>(null)
  const statusMessage = shallowRef('Ready')
  const errorMessage = shallowRef('')
  const pendingPicker = ref<PickerRequest | null>(null)
  const fieldPreview = shallowRef<FieldPreviewState | null>(null)
  const itemSelectorTraining = shallowRef<ItemSelectorTrainingState>(null)
  const itemSelectorPreview = shallowRef<ItemSelectorPreviewState>(null)
  const remoteRun = shallowRef<RemoteRunState>(null)
  const activeRemoteRunMeta = shallowRef<ActiveRemoteRunMeta>(null)
  const browserRunProgress = shallowRef<BrowserRunProgressState>(null)
  const sampleDetailRun = shallowRef<SampleDetailRunRefState>(null)
  const fixtureCapturePendingOverride = shallowRef<FixtureCaptureOverrideState>(null)
  const capturingFixture = shallowRef(false)
  const startingRemoteRun = shallowRef(false)
  const stoppingRemoteRun = shallowRef(false)
  const verifyingConnection = shallowRef(false)
  const debugEvents = shallowRef<ExtensionDebugEvent[]>([])
  const activeBrowserRunController = shallowRef<ActiveBrowserRunController | null>(null)
  let previewSequence = 0

  async function loadSession() {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    const fallback = createConfiguredDefaultSession()
    const nextSession = stored[STORAGE_KEY]
      ? normalizeSession(stored[STORAGE_KEY], fallback)
      : fallback

    session.value = applySessionValueDefaults(nextSession, configuredSessionDefaults)
  }

  function buildDebugSnapshot(): ExtensionDebugSnapshot {
    return {
      statusMessage: statusMessage.value,
      errorMessage: errorMessage.value,
      currentTabUrl: session.value.currentTabUrl,
      analysis: session.value.lastAnalysis
        ? cloneSerializableValue(session.value.lastAnalysis)
        : null,
      preset: cloneSerializableValue(session.value.preset),
      fixtureCapture: cloneSerializableValue(session.value.fixtureCapture),
      connection: {
        apiKeySource: session.value.connection.apiKeySource,
        appBaseUrlSource: session.value.appBaseUrlSource,
        verifiedEmail: session.value.connection.verifiedEmail,
        imageUploadEnabled: session.value.connection.imageUploadEnabled,
      },
      sampleDetailRun: sampleDetailRun.value ? cloneSerializableValue(sampleDetailRun.value) : null,
      browserRunProgress: browserRunProgress.value
        ? cloneSerializableValue(browserRunProgress.value)
        : null,
      remoteRun: remoteRun.value
        ? {
            pipelineId: remoteRun.value.pipelineId,
            jobId: remoteRun.value.jobId,
            summary: cloneSerializableValue(remoteRun.value.summary),
          }
        : null,
      draft: cloneSerializableValue(session.value.draft),
      events: cloneSerializableValue(debugEvents.value),
    }
  }

  function syncDebugSurface() {
    if (typeof window === 'undefined') {
      return
    }

    ;(window as ExtensionWindow).__BOAT_SEARCH_EXTENSION_DEBUG__ = buildDebugSnapshot()
  }

  function recordDebugEvent(type: string, message: string, detail?: Record<string, unknown>) {
    debugEvents.value = [...debugEvents.value, createDebugEvent(type, message, detail)].slice(
      -MAX_DEBUG_EVENTS,
    )
    syncDebugSurface()
  }

  watch(
    session,
    async (nextSession) => {
      try {
        await chrome.storage.local.set({
          [STORAGE_KEY]: cloneSerializableValue(nextSession),
        })
      } catch (error: unknown) {
        recordDebugEvent(
          'session-save-failed',
          error instanceof Error ? error.message : 'Could not persist the extension session.',
        )
      }
    },
    { deep: true },
  )

  watch(
    [
      session,
      statusMessage,
      errorMessage,
      sampleDetailRun,
      browserRunProgress,
      remoteRun,
      debugEvents,
    ],
    () => {
      syncDebugSurface()
    },
    { deep: true, immediate: true },
  )

  watch(
    () => session.value.draft,
    () => {
      const appliedPresetId = session.value.preset.appliedPresetId
      const appliedDraftFingerprint = session.value.preset.appliedDraftFingerprint

      session.value.preset.isDraftDirty = Boolean(
        appliedPresetId &&
        appliedDraftFingerprint &&
        buildPresetDraftFingerprint(cloneSerializableValue(session.value.draft)) !==
          appliedDraftFingerprint,
      )
    },
    { deep: true, immediate: true },
  )

  function updateMatchedPreset(pageUrl: string | null) {
    const match = pageUrl ? findMatchingSitePreset(pageUrl) : null

    session.value.preset.matchedPresetId = match?.id ?? null
    session.value.preset.matchedPresetLabel = match?.label ?? null
    session.value.preset.matchedContext = match?.context ?? null

    return match
  }

  async function refreshActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    activeTab.value = tab ?? null
    session.value.currentTabUrl = tab?.url || null
    updateMatchedPreset(tab?.url || null)
    return tab ?? null
  }

  async function ensureContentScript(tab: chrome.tabs.Tab) {
    if (!tab.id) {
      throw new Error('Open a normal web page before using the helper.')
    }

    if (!isWebPageUrl(tab.url)) {
      throw new Error('Open an http or https page before using the helper.')
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    })
  }

  async function sendToTab<T>(tab: chrome.tabs.Tab, message: object) {
    if (!tab.id) {
      throw new Error('Open a normal web page before using the helper.')
    }

    try {
      return (await chrome.tabs.sendMessage(tab.id, message)) as T
    } catch (error: unknown) {
      if (!hasMissingReceiverError(error)) {
        recordDebugEvent(
          'tab-message-failed',
          error instanceof Error ? error.message : 'Could not send a message to the active tab.',
          {
            tabId: tab.id,
          },
        )
        throw error
      }

      recordDebugEvent(
        'tab-message-retry',
        'The content script was missing on the active tab, so the helper is retrying after reinjection.',
        {
          tabId: tab.id,
        },
      )
      await ensureContentScript(tab)
      try {
        return (await chrome.tabs.sendMessage(tab.id, message)) as T
      } catch (retryError: unknown) {
        recordDebugEvent(
          'tab-message-failed',
          retryError instanceof Error
            ? retryError.message
            : 'The helper could not talk to the active tab after reinjecting the content script.',
          {
            tabId: tab.id,
          },
        )
        throw retryError
      }
    }
  }

  function clearFieldPreviewState() {
    fieldPreview.value = null
  }

  function upsertFieldRule(nextField: ScraperFieldRule) {
    const nextId = makeFieldId(nextField)
    const existingIndex = session.value.draft.config.fields.findIndex(
      (field) => makeFieldId(field) === nextId,
    )

    if (existingIndex >= 0) {
      session.value.draft.config.fields.splice(existingIndex, 1, nextField)
      return
    }

    session.value.draft.config.fields.push(nextField)
  }

  function setFieldsForScope(scope: ScraperFieldScope, fields: ScraperFieldRule[]) {
    const untouched = session.value.draft.config.fields.filter((field) => field.scope !== scope)
    session.value.draft.config.fields = [...untouched, ...fields]
  }

  const itemFields = computed({
    get: () => session.value.draft.config.fields.filter((field) => field.scope === 'item'),
    set: (fields) => {
      setFieldsForScope('item', fields)
    },
  })

  const detailFields = computed({
    get: () => session.value.draft.config.fields.filter((field) => field.scope === 'detail'),
    set: (fields) => {
      setFieldsForScope('detail', fields)
    },
  })

  const detailFollowFields = computed({
    get: () =>
      session.value.draft.config.fields.filter((field) => field.scope === 'detail-follow'),
    set: (fields) => {
      setFieldsForScope('detail-follow', fields)
    },
  })

  const matchedPreset = computed(() =>
    session.value.preset.matchedPresetId
      ? {
          id: session.value.preset.matchedPresetId,
          label:
            session.value.preset.matchedPresetLabel ||
            getSitePresetLabel(session.value.preset.matchedPresetId) ||
            'Preset',
          context: session.value.preset.matchedContext,
        }
      : null,
  )

  const trustedPresetActive = computed(() => isTrustedPresetReady(session.value))
  const presetValidationOptional = computed(() => trustedPresetActive.value)
  const shouldOfferMatchedPresetLoad = computed(() =>
    Boolean(
      matchedPreset.value?.id &&
      matchedPreset.value.context === 'search' &&
      (session.value.preset.appliedPresetId !== matchedPreset.value.id ||
        session.value.preset.isDraftDirty ||
        !session.value.preset.appliedDraftFingerprint),
      ),
  )

  function syncAnalysisSnapshot(
    analysis: AutoDetectedAnalysis,
    options: { mutateDraft: boolean },
  ) {
    if (options.mutateDraft) {
      applyAnalysisToSession(session.value, analysis)
    } else {
      session.value.currentTabUrl = analysis.pageUrl
      session.value.lastAnalysis = cloneSerializableValue(analysis)
      updateMatchedPreset(analysis.pageUrl)
    }

    recordDebugEvent('analysis-applied', buildAnalysisStatusMessage(analysis), {
      pageType: analysis.pageType,
      pageState: analysis.pageState,
      pageUrl: analysis.pageUrl,
      listingCardCount: analysis.stats.listingCardCount,
      detailLinkCount: analysis.stats.detailLinkCount,
      distinctImageCount: analysis.stats.distinctImageCount,
      fieldCount: analysis.fields.length,
      mutateDraft: options.mutateDraft,
    })

    if (
      options.mutateDraft &&
      analysis.pageType === 'search' &&
      analysis.pageState === 'ok' &&
      analysis.nextPageSelector
    ) {
      recordDebugEvent(
        'pagination-autofilled',
        `Auto-filled the next-page selector ${analysis.nextPageSelector}.`,
        {
          nextPageSelector: analysis.nextPageSelector,
        },
      )
    }

    if (
      options.mutateDraft &&
      analysis.pageType === 'search' &&
      analysis.pageState === 'ok' &&
      analysis.sampleDetailUrl
    ) {
      recordDebugEvent(
        'sample-detail-discovered',
        'Captured a sample detail URL from the search page.',
        {
          sampleDetailUrl: analysis.sampleDetailUrl,
        },
      )
    }
  }

  function applyAnalysis(analysis: AutoDetectedAnalysis) {
    syncAnalysisSnapshot(analysis, { mutateDraft: true })
  }

  function canAutoApplyMatchedPreset(presetId: SitePresetId, context: 'search' | 'detail' | null) {
    return canAutoApplySitePreset({
      draft: session.value.draft,
      appliedPresetId: session.value.preset.appliedPresetId,
      isDraftDirty: session.value.preset.isDraftDirty,
      match:
        context && presetId
          ? {
              id: presetId,
              label: getSitePresetLabel(presetId) || 'Preset',
              context,
            }
          : null,
    })
  }

  async function analyzeTabForPreset(tab: chrome.tabs.Tab) {
    try {
      const analysis = await sendToTab<AutoDetectedAnalysis>(tab, {
        type: 'EXTENSION_ANALYZE_PAGE',
      })
      recordDebugEvent('preset-analysis-applied', buildAnalysisStatusMessage(analysis), {
        pageType: analysis.pageType,
        pageState: analysis.pageState,
        pageUrl: analysis.pageUrl,
      })
      return analysis
    } catch (error: unknown) {
      recordDebugEvent(
        'auto-analyze-failed',
        error instanceof Error
          ? error.message
          : 'Could not analyze the active tab while loading a preset.',
      )
      return null
    }
  }

  function commitPresetDraft(
    presetId: SitePresetId,
    mode: SitePresetApplicationMode,
    pageUrl: string,
    analysis: AutoDetectedAnalysis | null,
  ) {
    const draft = buildPresetDraft(presetId, {
      pageUrl,
      analysis,
    })
    const presetLabel = getSitePresetLabel(presetId) || 'Preset'

    session.value.draft = draft
    session.value.stage = 'search'
    session.value.currentTabUrl = pageUrl
    session.value.sampleDetailUrl = analysis?.sampleDetailUrl || null
    session.value.lastAnalysis = analysis
    session.value.preset.appliedPresetId = presetId
    session.value.preset.appliedPresetLabel = presetLabel
    session.value.preset.appliedForUrl = pageUrl
    session.value.preset.applicationMode = mode
    session.value.preset.appliedDraftFingerprint = buildPresetDraftFingerprint(
      cloneSerializableValue(draft),
    )
    session.value.preset.isDraftDirty = false

    statusMessage.value = [
      `${presetLabel} ${describePresetApplication(mode)}.`,
      'Search and detail rules are ready, and sample-detail validation is optional.',
      analysis?.pageState && analysis.pageState !== 'ok' ? analysis.stateMessage || '' : '',
    ]
      .filter(Boolean)
      .join(' ')
    errorMessage.value = ''

    recordDebugEvent('preset-applied', `${presetLabel} ${describePresetApplication(mode)}.`, {
      presetId,
      mode,
      pageUrl,
      pageState: analysis?.pageState ?? null,
      itemSelector: draft.config.itemSelector,
      nextPageSelector: draft.config.nextPageSelector,
      fieldCount: draft.config.fields.length,
    })
  }

  async function applyMatchedPreset(mode: SitePresetApplicationMode = 'manual') {
    const match = matchedPreset.value
    const pageUrl = session.value.currentTabUrl

    if (!match?.id || !pageUrl) {
      throw new Error('Open a supported results page before loading a preset.')
    }

    if (match.context !== 'search') {
      throw new Error(
        `Open a supported search results page before loading ${match.label}.`,
      )
    }

    statusMessage.value =
      mode === 'auto' ? `Loading ${match.label} automatically...` : `Loading ${match.label}...`
    errorMessage.value = ''

    const tab = await refreshActiveTab()
    const analysis = tab && isWebPageUrl(tab.url) ? await analyzeTabForPreset(tab) : null

    commitPresetDraft(match.id, mode, pageUrl, analysis)
    return match
  }

  async function ensureTrustedPresetLoaded() {
    if (trustedPresetActive.value) {
      return session.value.preset.appliedPresetId
    }

    const match = matchedPreset.value
    if (match?.id && match.context === 'search') {
      await applyMatchedPreset('manual')
      return session.value.preset.appliedPresetId
    }

    if (match?.context === 'detail') {
      throw new Error(
        'Open a supported search results page so the extension can load the full trusted preset before scraping.',
      )
    }

    throw new Error(
      'Preset scraping is only available on supported search results pages. Open one, then scan the page to load its preset.',
    )
  }

  async function initializeForCurrentTab() {
    try {
      await loadSession()
      const tab = await refreshActiveTab()

      if (!tab?.url || !isWebPageUrl(tab.url)) {
        statusMessage.value =
          'Open a supported results page or another site to begin configuring a scrape.'
        return
      }

      const match = updateMatchedPreset(tab.url)
      if (!match) {
        statusMessage.value = session.value.connection.apiKey.trim()
          ? 'Ready'
          : 'Ready to configure a scrape.'
        return
      }

      recordDebugEvent('preset-matched', `Matched ${match.label} on the active tab.`, {
        presetId: match.id,
        context: match.context,
        pageUrl: tab.url,
      })

      if (canAutoApplyMatchedPreset(match.id, match.context)) {
        await applyMatchedPreset('auto')
        return
      }

      if (match.context === 'detail') {
        statusMessage.value = `${match.label} detail page detected. Open a supported search results page to auto-load the full preset, or validate this detail page manually.`
        return
      }

      statusMessage.value = `${match.label} is available for this page. Load it if you want to replace the current draft.`
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'The extension could not initialize the current tab.'
      errorMessage.value = message
      statusMessage.value = 'Initialization failed'
      recordDebugEvent('preset-initialize-failed', message)
    }
  }

  async function sendToActiveTab<T>(message: object) {
    const tab = await refreshActiveTab()
    if (!tab?.id) {
      throw new Error('Open a normal web page before using the helper.')
    }

    return sendToTab<T>(tab, message)
  }

  async function getVisibleCrawlTab(startUrl: string) {
    const tab = await refreshActiveTab()
    if (tab?.id && isWebPageUrl(tab.url)) {
      return tab
    }

    const nextTab = await chrome.tabs.create({ url: startUrl, active: true })
    if (!nextTab.id) {
      throw new Error('Could not open a scraper tab in this browser window.')
    }

    return nextTab
  }

  async function analyzeCurrentPage() {
    errorMessage.value = ''
    clearFieldPreviewState()
    itemSelectorPreview.value = null
    statusMessage.value = 'Analyzing current page...'

    try {
      const analysis = await sendToActiveTab<AutoDetectedAnalysis>({
        type: 'EXTENSION_ANALYZE_PAGE',
      })
      const match = updateMatchedPreset(analysis.pageUrl)

      if (match?.context === 'search' && canAutoApplyMatchedPreset(match.id, match.context)) {
        commitPresetDraft(match.id, 'auto', analysis.pageUrl, analysis)
        return
      }

      syncAnalysisSnapshot(analysis, { mutateDraft: false })
      statusMessage.value = buildAnalysisStatusMessage(analysis)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'The helper could not connect to the current page.'
      errorMessage.value = message
      statusMessage.value = 'Analysis failed'
      recordDebugEvent('analysis-failed', message)
    }
  }

  function setSelectedFixtureTemplate(template: FixtureCaptureTemplate) {
    session.value.fixtureCapture.selectedTemplate = template
    if (fixtureCapturePendingOverride.value?.template !== template) {
      fixtureCapturePendingOverride.value = null
    }
  }

  function updateFixtureCustomLabel(value: string) {
    session.value.fixtureCapture.customLabel = value
  }

  async function captureVisibleTabPng(activeTabValue: chrome.tabs.Tab) {
    if (typeof activeTabValue.windowId !== 'number') {
      throw new Error('Could not identify the current browser window for screenshot capture.')
    }

    return await chrome.tabs.captureVisibleTab(activeTabValue.windowId, {
      format: 'png',
    })
  }

  async function captureFixture(
    template: FixtureCaptureTemplate,
    options: { allowMismatch?: boolean } = {},
  ) {
    setSelectedFixtureTemplate(template)
    errorMessage.value = ''
    capturingFixture.value = true
    statusMessage.value = 'Analyzing the current page for fixture capture...'

    try {
      const tab = await refreshActiveTab()
      if (!tab?.id || !isWebPageUrl(tab.url)) {
        throw new Error('Open the page you want to capture in the active tab first.')
      }

      const analysis = await sendToTab<AutoDetectedAnalysis>(tab, {
        type: 'EXTENSION_ANALYZE_PAGE',
      })
      syncAnalysisSnapshot(analysis, { mutateDraft: false })

      const validation = evaluateFixtureCaptureTemplate(
        template,
        analysis,
        session.value.currentTabUrl,
      )
      if (template !== 'custom' && validation.status === 'mismatch' && !options.allowMismatch) {
        fixtureCapturePendingOverride.value = {
          template,
          message: validation.note,
        }
        statusMessage.value = validation.note
        recordDebugEvent('fixture-capture-validation-blocked', validation.note, {
          template,
          pageType: analysis.pageType,
          pageState: analysis.pageState,
          pageUrl: analysis.pageUrl,
        })
        return
      }

      fixtureCapturePendingOverride.value = null
      statusMessage.value = 'Capturing the current page and preparing fixture downloads...'

      const [captureResponse, screenshotDataUrl] = await Promise.all([
        sendToTab<FixtureCaptureResponse>(tab, {
          type: 'EXTENSION_CAPTURE_PAGE',
          request: { template },
        }),
        captureVisibleTabPng(tab),
      ])

      syncAnalysisSnapshot(captureResponse.analysis, { mutateDraft: false })

      const fixtureLabel = resolveFixtureLabel(template, session.value.fixtureCapture.customLabel)
      const host = (() => {
        try {
          return new URL(captureResponse.page.url).hostname
        } catch {
          return 'unknown'
        }
      })()
      const fileStem = buildFixtureCaptureFileStem(host, fixtureLabel)
      const files = buildFixtureCaptureFileNames(fileStem)
      const capturedAt = new Date().toISOString()
      const metadata = buildFixtureCaptureMetadata({
        capturedAt,
        host,
        fixtureLabel,
        currentUrl: captureResponse.page.url,
        title: captureResponse.page.title,
        analysis: captureResponse.analysis,
        matchedPresetId: session.value.preset.matchedPresetId,
        matchedPresetLabel: session.value.preset.matchedPresetLabel,
        appliedPresetId: session.value.preset.appliedPresetId,
        appliedPresetLabel: session.value.preset.appliedPresetLabel,
        viewport: captureResponse.page.viewport,
      })

      const [htmlFileName, pngFileName, metaFileName] = files
      await Promise.all([
        downloadBlobFile(
          htmlFileName,
          new Blob([captureResponse.html], {
            type: 'text/html;charset=utf-8',
          }),
        ),
        dataUrlToBlob(screenshotDataUrl).then((blob) => downloadBlobFile(pngFileName, blob)),
        downloadBlobFile(
          metaFileName,
          new Blob([`${JSON.stringify(metadata, null, 2)}\n`], {
            type: 'application/json;charset=utf-8',
          }),
        ),
      ])

      const summary: FixtureCaptureSummary = {
        template,
        fileStem,
        files,
        currentUrl: captureResponse.page.url,
        pageType: captureResponse.analysis.pageType,
        pageState: captureResponse.analysis.pageState,
        capturedAt,
      }
      session.value.fixtureCapture.captured[template] = {
        template,
        fileStem,
        files,
        currentUrl: captureResponse.page.url,
        pageType: captureResponse.analysis.pageType,
        pageState: captureResponse.analysis.pageState,
        capturedAt,
      }
      session.value.fixtureCapture.lastCapture = summary

      statusMessage.value = `Downloaded ${htmlFileName}, ${pngFileName}, and ${metaFileName}.`
      recordDebugEvent(
        'fixture-capture-complete',
        `Downloaded fixture files for ${template}.`,
        {
          template,
          fileStem,
          pageUrl: captureResponse.page.url,
          pageType: captureResponse.analysis.pageType,
          pageState: captureResponse.analysis.pageState,
        },
      )
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not capture the current fixture page.'
      errorMessage.value = message
      statusMessage.value = 'Fixture capture failed'
      recordDebugEvent('fixture-capture-failed', message, {
        template,
      })
    } finally {
      capturingFixture.value = false
    }
  }

  async function startPicker(request: PickerRequest) {
    errorMessage.value = ''
    await clearFieldPreview()
    itemSelectorPreview.value = null
    if (request.kind === 'itemSelector') {
      itemSelectorTraining.value = {
        kind: request.kind,
        selectionCount: 0,
        selector: '',
        matchCount: 0,
        ready: false,
      }
    }
    pendingPicker.value = request
    statusMessage.value =
      request.kind === 'itemSelector'
        ? 'Click listing cards to add examples. Press Enter to save once the detected-card count looks right.'
        : 'Click an element on the page to capture a selector.'

    try {
      await sendToActiveTab({
        type: 'EXTENSION_START_PICKER',
        picker: {
          ...request,
          itemSelector: request.scope === 'item' ? session.value.draft.config.itemSelector : '',
        },
      })
    } catch (error: unknown) {
      pendingPicker.value = null
      const message = error instanceof Error ? error.message : 'Could not start the element picker.'
      errorMessage.value = message
      statusMessage.value = 'Picker failed'
    }
  }

  function applyPickerResult(result: PickerResult) {
    pendingPicker.value = null

    if (result.kind === 'itemSelector') {
      session.value.draft.config.itemSelector = result.selector
      itemSelectorTraining.value = {
        kind: result.kind,
        selectionCount: result.selectionCount || 0,
        selector: result.selector,
        matchCount: result.matchCount || 0,
        ready: true,
      }
      statusMessage.value =
        result.selectionCount != null && result.matchCount != null
          ? `Saved item selector from ${result.selectionCount} examples (${result.matchCount} matches): ${result.selector}`
          : `Saved item selector: ${result.selector}`
      return
    }

    if (result.kind === 'nextPageSelector') {
      session.value.draft.config.nextPageSelector = result.selector
      statusMessage.value = `Saved pagination selector: ${result.selector}`
      return
    }

    if (!result.fieldKey || !result.scope) return

    upsertFieldRule(
      createFieldRule(result.fieldKey, result.scope, result.selector, {
        extract: result.extract,
        attribute: result.attribute,
        required: result.fieldKey === 'url' || result.fieldKey === 'title',
      }),
    )
    statusMessage.value = `Updated ${result.scope} field ${result.fieldKey}`
  }

  const runtimeListener = (message: BackgroundMessage) => {
    if (message.type === 'EXTENSION_PICKER_RESULT') {
      applyPickerResult(message.result)
      return
    }

    if (message.type === 'EXTENSION_PICKER_PROGRESS' && message.progress.kind === 'itemSelector') {
      itemSelectorTraining.value = message.progress
      statusMessage.value =
        message.progress.selectionCount === 0
          ? 'Listing-card picker reset. Click cards to add examples.'
          : message.progress.ready
            ? `${message.progress.selectionCount} examples selected. Current selector matches ${message.progress.matchCount} cards. Press Enter on the page to save it.`
            : `${message.progress.selectionCount} example selected. Click another listing card.`
      return
    }

    if (message.type === 'EXTENSION_PICKER_CANCELLED') {
      pendingPicker.value = null
      statusMessage.value = `${message.kind === 'itemSelector' ? 'Listing-card' : 'Element'} picker cancelled.`
    }
  }

  const activatedListener = () => {
    clearFieldPreviewState()
    void refreshActiveTab()
  }

  const updatedListener = (
    tabId: number,
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ) => {
    if (!activeTab.value?.id || activeTab.value.id !== tabId) {
      return
    }

    if (changeInfo.url || changeInfo.status === 'complete') {
      activeTab.value = tab
      session.value.currentTabUrl = tab.url || null
      updateMatchedPreset(tab.url || null)
      clearFieldPreviewState()
    }
  }

  chrome.runtime.onMessage.addListener(runtimeListener)
  chrome.tabs.onActivated.addListener(activatedListener)
  chrome.tabs.onUpdated.addListener(updatedListener)
  onScopeDispose(() => {
    chrome.runtime.onMessage.removeListener(runtimeListener)
    chrome.tabs.onActivated.removeListener(activatedListener)
    chrome.tabs.onUpdated.removeListener(updatedListener)
  })

  function addField(scope: ScraperFieldScope) {
    const nextKey = scope === 'item' ? 'price' : 'description'
    const nextField = createFieldRule(nextKey, scope, '')
    const scopedFields = session.value.draft.config.fields.filter((field) => field.scope === scope)
    setFieldsForScope(scope, [...scopedFields, nextField])
  }

  function removeField(scope: ScraperFieldScope, index: number) {
    const scopedFields = session.value.draft.config.fields.filter((field) => field.scope === scope)
    if (scopedFields.length <= 1) return
    const nextFields = [...scopedFields]
    nextFields.splice(index, 1)
    setFieldsForScope(scope, nextFields)
  }

  async function openSampleDetailPage() {
    const targetUrl = session.value.sampleDetailUrl || session.value.lastAnalysis?.sampleDetailUrl
    if (!targetUrl) {
      errorMessage.value = 'Analyze a search page first so the helper can discover a detail URL.'
      return
    }

    errorMessage.value = ''
    clearFieldPreviewState()
    itemSelectorPreview.value = null
    statusMessage.value = 'Opening sample detail page and waiting for it to load...'
    sampleDetailRun.value = createSampleDetailRunState('opening', {
      url: targetUrl,
      message: 'Opening the sample detail page and preparing an automatic scan.',
    })
    recordDebugEvent('sample-detail-opening', 'Opening the sample detail page.', {
      url: targetUrl,
    })
    const tab = await chrome.tabs.create({ url: targetUrl, active: true })
    session.value.stage = 'detail'
    session.value.currentTabUrl = targetUrl

    if (!tab.id) {
      statusMessage.value = 'Sample detail page opened.'
      sampleDetailRun.value = createSampleDetailRunState('opened', {
        url: targetUrl,
        message:
          'The sample detail page opened. Return here after it settles, then re-scan if needed.',
      })
      recordDebugEvent('sample-detail-opened', 'Opened the sample detail page.', {
        url: targetUrl,
      })
      return
    }

    try {
      const readyTab = await waitForTabComplete(tab.id, {
        timeoutMs: 5_000,
        allowPartialLoad: true,
      })
      sampleDetailRun.value = createSampleDetailRunState('opened', {
        url: readyTab.url || targetUrl,
        message:
          readyTab.status === 'complete'
            ? 'The sample detail page is open. Running the automatic detail scan now.'
            : 'The sample detail page is still settling after 5 seconds. Running the automatic detail scan now.',
      })
      recordDebugEvent(
        'sample-detail-opened',
        readyTab.status === 'complete'
          ? 'The sample detail page finished loading.'
          : 'The sample detail page was still loading after 5 seconds, so the helper started scanning anyway.',
        {
          url: readyTab.url || targetUrl,
          tabStatus: readyTab.status || 'unknown',
        },
      )
      const detailAnalysis = await sendToTab<AutoDetectedAnalysis>(readyTab, {
        type: 'EXTENSION_ANALYZE_PAGE',
      })
      syncAnalysisSnapshot(detailAnalysis, {
        mutateDraft: !trustedPresetActive.value,
      })
      statusMessage.value =
        detailAnalysis.pageType === 'detail' && detailAnalysis.pageState === 'ok'
          ? `Scanned the detail page and found ${detailAnalysis.fields.length} field suggestion${detailAnalysis.fields.length === 1 ? '' : 's'} across ${detailAnalysis.stats.distinctImageCount} images.`
          : buildAnalysisStatusMessage(detailAnalysis)
      sampleDetailRun.value =
        detailAnalysis.pageType === 'detail' && detailAnalysis.pageState === 'ok'
          ? createSampleDetailRunState('scanned', {
              url: detailAnalysis.pageUrl,
              fieldCount: detailAnalysis.fields.length,
              imageCount: detailAnalysis.stats.distinctImageCount,
              message: `Opened and auto-scanned the sample detail page. Found ${detailAnalysis.fields.length} field suggestion${detailAnalysis.fields.length === 1 ? '' : 's'} and ${detailAnalysis.stats.distinctImageCount} gallery image${detailAnalysis.stats.distinctImageCount === 1 ? '' : 's'}.`,
            })
          : createSampleDetailRunState('error', {
              url: detailAnalysis.pageUrl,
              fieldCount: detailAnalysis.fields.length,
              imageCount: detailAnalysis.stats.distinctImageCount,
              message:
                detailAnalysis.stateMessage ||
                'The sample page opened, but it did not classify as a stable detail page yet.',
            })
      recordDebugEvent(
        detailAnalysis.pageType === 'detail' && detailAnalysis.pageState === 'ok'
          ? 'sample-detail-scanned'
          : 'sample-detail-scan-blocked',
        sampleDetailRun.value.message,
        {
          url: detailAnalysis.pageUrl,
          pageType: detailAnalysis.pageType,
          pageState: detailAnalysis.pageState,
          fieldCount: detailAnalysis.fields.length,
          imageCount: detailAnalysis.stats.distinctImageCount,
        },
      )
    } catch (error: unknown) {
      statusMessage.value = 'Sample detail page opened.'
      errorMessage.value =
        error instanceof Error ? error.message : 'Could not auto-scan the detail page.'
      sampleDetailRun.value = createSampleDetailRunState('error', {
        url: targetUrl,
        message:
          error instanceof Error ? error.message : 'Could not auto-scan the sample detail page.',
      })
      recordDebugEvent('sample-detail-scan-failed', sampleDetailRun.value.message, {
        url: targetUrl,
      })
    }
  }

  async function waitForTabComplete(
    tabId: number,
    options: {
      timeoutMs?: number
      allowPartialLoad?: boolean
      strictTimeoutMessage?: string
    } = {},
  ) {
    const {
      timeoutMs = 20_000,
      allowPartialLoad = false,
      strictTimeoutMessage = 'The page took too long to finish loading.',
    } = options
    const currentTab = await chrome.tabs.get(tabId)
    if (currentTab.status === 'complete') {
      return currentTab
    }

    return await new Promise<chrome.tabs.Tab>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(updatedListener)
        if (!allowPartialLoad) {
          reject(new Error(strictTimeoutMessage))
          return
        }

        chrome.tabs
          .get(tabId)
          .then(resolve)
          .catch(() =>
            reject(new Error('The tab closed before the helper could continue.')),
          )
      }, timeoutMs)

      const updatedListener = (
        updatedTabId: number,
        changeInfo: chrome.tabs.OnUpdatedInfo,
        updatedTab: chrome.tabs.Tab,
      ) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
          return
        }

        window.clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(updatedListener)
        resolve(updatedTab)
      }

      chrome.tabs.onUpdated.addListener(updatedListener)
    })
  }

  async function previewField(field: ScraperFieldRule) {
    previewSequence += 1
    const currentSequence = previewSequence
    const fieldId = makeFieldId(field)

    if (!field.selector.trim()) {
      fieldPreview.value = {
        field,
        fieldId,
        status: 'error',
        selector: '',
        matchCount: 0,
        highlightedCount: 0,
        sampleValues: [],
        error: 'No selector captured yet. Pick the mapping from the page first.',
      }
      return
    }

    fieldPreview.value = {
      field,
      fieldId,
      status: 'loading',
      selector: field.selector,
      matchCount: 0,
      highlightedCount: 0,
      sampleValues: [],
      error: '',
    }

    try {
      const preview = await sendToActiveTab<FieldPreviewResult>({
        type: 'EXTENSION_PREVIEW_FIELD',
        preview: {
          field,
          itemSelector: field.scope === 'item' ? session.value.draft.config.itemSelector : '',
        },
      })

      if (currentSequence !== previewSequence) {
        return
      }

      fieldPreview.value = {
        ...preview,
        field,
        fieldId,
        status: 'ready',
        error:
          preview.matchCount === 0
            ? 'No matches on the current page. Check the selector or switch to the correct page type.'
            : '',
      }
    } catch (error: unknown) {
      if (currentSequence !== previewSequence) {
        return
      }

      fieldPreview.value = {
        field,
        fieldId,
        status: 'error',
        selector: field.selector,
        matchCount: 0,
        highlightedCount: 0,
        sampleValues: [],
        error: error instanceof Error ? error.message : 'Could not preview this field on the page.',
      }
    }
  }

  async function clearFieldPreview() {
    previewSequence += 1
    clearFieldPreviewState()
    itemSelectorPreview.value = null

    try {
      await sendToActiveTab({ type: 'EXTENSION_CLEAR_PREVIEW' })
    } catch {
      // Ignore preview cleanup failures; this should never block the workflow.
    }
  }

  async function navigateTab(
    tabId: number,
    url: string,
    options: {
      timeoutMs?: number
      allowPartialLoad?: boolean
      strictTimeoutMessage?: string
    } = {},
  ) {
    const nextTab = await chrome.tabs.update(tabId, { url })
    if (!nextTab || !nextTab.id) {
      throw new Error('Could not reuse the scraper tab.')
    }

    return await waitForTabComplete(nextTab.id, options)
  }

  function mergeBrowserRecord(
    baseRecord: BrowserScrapeRecord,
    detailPatch: Partial<BrowserScrapeRecord>,
  ) {
    const nextRecord: BrowserScrapeRecord = {
      ...baseRecord,
      rawFields: {
        ...baseRecord.rawFields,
        ...(detailPatch.rawFields || {}),
      },
      warnings: uniqueStrings([...baseRecord.warnings, ...(detailPatch.warnings || [])]),
      images: uniqueStrings([...baseRecord.images, ...(detailPatch.images || [])]),
    }

    const scalarKeys = [
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
      'sellerType',
      'listingType',
      'fullText',
    ] as const

    for (const key of scalarKeys) {
      const nextValue = detailPatch[key]
      if (nextValue != null && nextValue !== '') {
        if (key === 'url' && baseRecord.url) {
          continue
        }
        if (key === 'listingType' && baseRecord.listingType) {
          continue
        }
        nextRecord[key] = nextValue as never
      }
    }

    return nextRecord
  }

  function buildBrowserRecordIdentity(record: BrowserScrapeRecord) {
    return record.url || record.listingId || `${record.source}:${record.title || ''}:${record.location || ''}`
  }

  function hasStructuredDetailFields(record: Partial<BrowserScrapeRecord>) {
    return Boolean(
      record.contactInfo ||
        record.otherDetails ||
        record.features ||
        record.propulsion ||
        record.specifications,
    )
  }

  function shouldRetryWeakDetailRecord(record: BrowserScrapeRecord) {
    return record.images.length <= 1 && !hasStructuredDetailFields(record)
  }

  function buildListingAuditFromRecord(
    runId: number,
    record: BrowserScrapeRecord,
    options: {
      pageNumber: number | null
      duplicateDecision: ExtensionRunListingAudit['duplicateDecision']
      detailStatus: ExtensionDetailStatus
      detailAttempts: number
      retryQueued: boolean
      error?: string | null
      warnings?: string[]
      auditJson?: Record<string, unknown>
    },
  ): ExtensionRunListingAudit {
    return {
      runId,
      identityKey: buildBrowserRecordIdentity(record),
      source: record.source,
      listingId: record.listingId,
      listingUrl: record.url,
      detailUrl: record.url,
      pageNumber: options.pageNumber,
      duplicateDecision: options.duplicateDecision,
      detailStatus: options.detailStatus,
      detailAttempts: options.detailAttempts,
      retryQueued: options.retryQueued,
      weakFingerprint: shouldRetryWeakDetailRecord(record),
      finalImageCount: record.images.length,
      finalHasStructuredDetails: hasStructuredDetailFields(record),
      error: options.error ?? null,
      warnings: uniqueStrings([...(options.warnings || []), ...record.warnings]),
      auditJson: options.auditJson,
    }
  }

  function buildYachtWorldDetailBackfillSeedRecord(
    draft: ScraperPipelineDraft,
    detailUrl: string,
  ): BrowserScrapeRecord {
    return {
      source: draft.boatSource,
      url: detailUrl,
      listingId: extractListingIdFromUrl(detailUrl),
      title: null,
      make: null,
      model: null,
      year: null,
      length: null,
      price: null,
      currency: null,
      location: null,
      city: null,
      state: null,
      country: null,
      description: null,
      sellerType: null,
      listingType: null,
      images: [],
      fullText: null,
      rawFields: {},
      warnings: [],
    }
  }

  function upsertBrowserRunRecord(records: BrowserScrapeRecord[], record: BrowserScrapeRecord) {
    const identity = buildBrowserRecordIdentity(record)
    const existingIndex = records.findIndex(
      (entry) => buildBrowserRecordIdentity(entry) === identity,
    )

    if (existingIndex >= 0) {
      records.splice(existingIndex, 1, mergeBrowserRecord(records[existingIndex]!, record))
      return
    }

    records.push(record)
  }

  function buildBrowserRunCsv(records: BrowserScrapeRecord[]) {
    const headers = [
      'source',
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
      'sellerType',
      'listingType',
      'images',
      'fullText',
      'warnings',
    ]

    const rows = records.map((record) =>
      [
        record.source,
        record.url,
        record.listingId,
        record.title,
        record.make,
        record.model,
        record.year,
        record.length,
        record.price,
        record.currency,
        record.location,
        record.city,
        record.state,
        record.country,
        record.description,
        record.contactInfo,
        record.contactName,
        record.contactPhone,
        record.otherDetails,
        record.disclaimer,
        record.features,
        record.electricalEquipment,
        record.electronics,
        record.insideEquipment,
        record.outsideEquipment,
        record.additionalEquipment,
        record.propulsion,
        record.engineMake,
        record.engineModel,
        record.engineYearDetail,
        record.totalPower,
        record.engineHours,
        record.engineTypeDetail,
        record.driveType,
        record.fuelTypeDetail,
        record.propellerType,
        record.propellerMaterial,
        record.specifications,
        record.cruisingSpeed,
        record.maxSpeed,
        record.range,
        record.lengthOverall,
        record.maxBridgeClearance,
        record.maxDraft,
        record.minDraftDetail,
        record.beamDetail,
        record.dryWeight,
        record.windlass,
        record.electricalCircuit,
        record.deadriseAtTransom,
        record.hullMaterial,
        record.hullShape,
        record.keelType,
        record.freshWaterTank,
        record.fuelTank,
        record.holdingTank,
        record.guestHeads,
        record.sellerType,
        record.listingType,
        record.images,
        record.fullText,
        record.warnings,
      ]
        .map((value) => escapeCsvCell(value))
        .join(','),
    )

    return [headers.join(','), ...rows].join('\r\n')
  }

  async function downloadBlobFile(fileName: string, blob: Blob) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('File download is unavailable in this browser context.')
    }

    const blobUrl = URL.createObjectURL(blob)

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'EXTENSION_DOWNLOAD_FILE',
        fileName,
        url: blobUrl,
      } satisfies BackgroundMessage)) as { ok?: boolean; error?: string; downloadId?: number }

      if (!response?.ok || typeof response.downloadId !== 'number') {
        throw new Error(response?.error || `Could not start the download for ${fileName}.`)
      }
    } finally {
      window.setTimeout(() => {
        URL.revokeObjectURL(blobUrl)
      }, 60_000)
    }
  }

  async function dataUrlToBlob(dataUrl: string) {
    const response = await fetch(dataUrl)
    return await response.blob()
  }

  async function downloadBrowserRunCsv(draft: ScraperPipelineDraft, records: BrowserScrapeRecord[]) {
    const stem = sanitizeFileStem(draft.name || draft.boatSource || 'browser-scrape') || 'browser-scrape'
    const fileName = `${stem}-${formatCsvTimestamp()}.csv`
    const blob = new Blob([buildBrowserRunCsv(records)], {
      type: 'text/csv;charset=utf-8',
    })
    await downloadBlobFile(fileName, blob)

    return fileName
  }

  async function runCsvFallbackScrape(
    draft: ScraperPipelineDraft,
    presetId: SitePresetId | null,
    reason: string,
    seededRecords: BrowserScrapeRecord[] = [],
  ) {
    const localRecords = [...seededRecords]
    const localRunState = {
      recordsPersisted: localRecords.length,
      imagesUploaded: 0,
      skippedExisting: 0,
    }
    const localRunController: ActiveBrowserRunController = { stopRequested: false }

    statusMessage.value = 'Boat Search is unavailable, so the helper is scraping locally and preparing a CSV...'
    recordDebugEvent(
      'browser-scrape-csv-fallback-started',
      'Boat Search failed, so the helper is retrying as a local CSV export.',
      {
        reason,
        seededRecordCount: seededRecords.length,
      },
    )

    const browserRun = await crawlDraftInBrowser(
      1,
      draft,
      presetId,
      localRunState,
      createBrowserRunIdentityState(null),
      localRunController,
      async (record: BrowserScrapeRecord) => {
        upsertBrowserRunRecord(localRecords, cloneSerializableValue(record))
        localRunState.recordsPersisted = localRecords.length
      },
      async () => {},
      async (_summary: BrowserScrapeSummary, progress: BrowserScrapeProgress) => {
        browserRunProgress.value = {
          ...progress,
          recordsPersisted: localRecords.length,
          imagesUploaded: 0,
        }
      },
    )

    const fileName = await downloadBrowserRunCsv(draft, localRecords)
    browserRunProgress.value = null
    errorMessage.value = ''
    remoteRun.value = null
    statusMessage.value = `Boat Search failed (${reason}). Downloaded ${fileName} with ${localRecords.length} rows instead.`
    recordDebugEvent(
      'browser-scrape-csv-fallback-complete',
      'Completed a local browser scrape and downloaded a CSV fallback.',
      {
        fileName,
        recordCount: localRecords.length,
        pagesVisited: browserRun.summary.pagesVisited,
        itemsSeen: browserRun.summary.itemsSeen,
        itemsExtracted: browserRun.summary.itemsExtracted,
        skippedExisting: browserRun.summary.skippedExisting,
      },
    )
  }

  async function fetchBoatSearchJson<T>(path: string, init: RequestInit = {}) {
    const base = getBoatSearchBaseUrl(session.value)
    if (!base) {
      throw new Error('Set the Boat Search app URL before starting a scrape.')
    }

    const method = (init.method || 'GET').toUpperCase()
    const requestUrl = `${base}${path}`
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    const headers = isFormData
      ? createBoatSearchHeaders(session.value, init.headers || {})
      : createBoatSearchHeaders(session.value, {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        })

    let response: Response
    try {
      response = await fetch(requestUrl, {
        ...init,
        credentials: 'omit',
        headers,
      })
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'The helper could not reach Boat Search.'
      recordDebugEvent('boat-search-request-failed', message, {
        method,
        path,
        url: requestUrl,
        phase: 'network',
      })
      throw new BoatSearchRequestError(message, {
        method,
        path,
        phase: 'network',
      })
    }

    if (!response.ok) {
      const message = await readErrorMessage(response)
      recordDebugEvent('boat-search-request-failed', message, {
        method,
        path,
        url: requestUrl,
        phase: 'response',
        status: response.status,
      })
      throw new BoatSearchRequestError(message, {
        method,
        path,
        status: response.status,
        phase: 'response',
      })
    }

    return (await response.json()) as T
  }

  async function verifyBoatSearchConnection(force = false) {
    if (!force && session.value.connection.verifiedAt && session.value.connection.apiKey.trim()) {
      return
    }

    verifyingConnection.value = true
    errorMessage.value = ''

    try {
      const result = await fetchBoatSearchJson<ExtensionAuthStatusResponse>(
        '/api/admin/scraper-extension/auth',
      )
      session.value.connection.verifiedAt = new Date().toISOString()
      session.value.connection.verifiedEmail = result.user.email
      session.value.connection.verifiedName = result.user.name
      session.value.connection.imageUploadEnabled = result.imageUploadEnabled
      statusMessage.value = `Connected to Boat Search as ${result.user.email}.`
      recordDebugEvent('boat-search-authenticated', `Connected to Boat Search as ${result.user.email}.`, {
        imageUploadEnabled: result.imageUploadEnabled,
      })
      return result
    } catch (error: unknown) {
      session.value.connection.verifiedAt = null
      session.value.connection.verifiedEmail = null
      session.value.connection.verifiedName = null
      session.value.connection.imageUploadEnabled = false
      recordDebugEvent(
        'boat-search-auth-failed',
        error instanceof Error ? error.message : 'Boat Search authentication failed.',
      )
      throw error
    } finally {
      verifyingConnection.value = false
    }
  }

  async function persistBrowserRecordToBoatSearch(
    run: ExtensionRunStartResponse,
    draft: ScraperPipelineDraft,
    listing: ExtensionRunListingAudit,
    record: BrowserScrapeRecord,
  ) {
    return await fetchBoatSearchJson<ExtensionRunRecordResponse>(
      '/api/admin/scraper-extension/run/record',
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: run.pipelineId,
          jobId: run.jobId,
          draft,
          listing,
          record,
        }),
      },
    )
  }

  async function persistBrowserListingAuditToBoatSearch(
    run: ExtensionRunStartResponse,
    listing: ExtensionRunListingAudit,
  ) {
    return await fetchBoatSearchJson<ExtensionRunListingResponse>(
      '/api/admin/scraper-extension/run/listing',
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: run.pipelineId,
          jobId: run.jobId,
          listing,
        }),
      },
    )
  }

  async function persistBrowserRunProgressToBoatSearch(
    run: ExtensionRunStartResponse,
    summary: BrowserScrapeSummary,
    progress: BrowserScrapeProgress,
    runState: {
      inserted: number
      updated: number
      recordsPersisted: number
      imagesUploaded: number
      skippedExisting: number
    },
    options: {
      eventType?: 'progress' | 'detail_retry_started' | 'detail_retry_finished'
      message?: string | null
      pageNumber?: number | null
      searchUrl?: string | null
    } = {},
  ) {
    return await fetchBoatSearchJson<ExtensionRunProgressResponse>(
      '/api/admin/scraper-extension/run/progress',
      {
        method: 'POST',
        body: JSON.stringify({
          pipelineId: run.pipelineId,
          jobId: run.jobId,
          summary,
          inserted: runState.inserted,
          updated: runState.updated,
          progress,
          eventType: options.eventType || 'progress',
          message: options.message ?? null,
          pageNumber: options.pageNumber ?? null,
          searchUrl: options.searchUrl ?? progress.currentUrl ?? null,
        }),
      },
    )
  }

  async function persistBrowserRunStopToBoatSearch(meta: ActiveRemoteRunMeta, message: string) {
    if (!meta) {
      return
    }

    await fetchBoatSearchJson<ExtensionRunStopResponse>('/api/admin/scraper-extension/run/stop', {
      method: 'POST',
      body: JSON.stringify({
        pipelineId: meta.pipelineId,
        jobId: meta.jobId,
        message,
      }),
    })
  }

  function buildBrowserScrapeSummarySnapshot(
    searchWarnings: string[],
    searchRecords: BrowserScrapeRecord[],
    visitedUrls: string[],
    pagesVisited: number,
    itemsSeen: number,
    skippedExisting: number,
  ) {
    return {
      pagesVisited,
      itemsSeen,
      itemsExtracted: searchRecords.length,
      skippedExisting,
      visitedUrls: [...visitedUrls],
      warnings: uniqueStrings([
        ...searchWarnings,
        ...searchRecords.flatMap((record) => record.warnings),
      ]),
    } satisfies BrowserScrapeSummary
  }

  async function crawlDraftInBrowser(
    runId: number,
    draft: ScraperPipelineDraft,
    presetId: SitePresetId | null,
    runState: { recordsPersisted: number; imagesUploaded: number; skippedExisting: number },
    existingIdentityState: ReturnType<typeof createBrowserRunIdentityState>,
    controller: ActiveBrowserRunController,
    onRecord: (record: BrowserScrapeRecord, listing: ExtensionRunListingAudit) => Promise<void>,
    onListingAudit: (listing: ExtensionRunListingAudit) => Promise<void>,
    onProgress: (
      summary: BrowserScrapeSummary,
      progress: BrowserScrapeProgress,
      options?: {
        eventType?: 'progress' | 'detail_retry_started' | 'detail_retry_finished'
        message?: string | null
        pageNumber?: number | null
        searchUrl?: string | null
      },
    ) => Promise<void>,
  ) {
    let detailPagesCompleted = 0
    let detailPagesTotal = 0
    const detailRetryQueue: string[] = []
    const queuedDetailRetryIdentities = new Set<string>()
    const listingDuplicateDecisions = new Map<
      string,
      ExtensionRunListingAudit['duplicateDecision']
    >()
    const listingPageNumbers = new Map<string, number | null>()

    function queueDetailRetry(record: BrowserScrapeRecord) {
      const identity = buildBrowserRecordIdentity(record)
      if (!identity || queuedDetailRetryIdentities.has(identity)) {
        return
      }

      queuedDetailRetryIdentities.add(identity)
      detailRetryQueue.push(identity)
    }

    function assignSearchBrowserRunProgress(pageUrl: string) {
      browserRunProgress.value = {
        stage: 'search',
        currentUrl: pageUrl,
        pagesVisited,
        itemsSeen,
        itemsExtracted: searchRecords.length,
        skippedExisting: runState.skippedExisting,
        detailPagesCompleted,
        detailPagesTotal,
        recordsPersisted: runState.recordsPersisted,
        imagesUploaded: runState.imagesUploaded,
      }
    }

    async function emitBrowserRunProgress(
      options: {
        eventType?: 'progress' | 'detail_retry_started' | 'detail_retry_finished'
        message?: string | null
        pageNumber?: number | null
        searchUrl?: string | null
      } = {},
    ) {
      throwIfBrowserRunStopped(controller)
      if (!browserRunProgress.value) {
        return
      }

      await onProgress(
        buildBrowserScrapeSummarySnapshot(
          searchWarnings,
          searchRecords,
          visitedUrls,
          pagesVisited,
          itemsSeen,
          runState.skippedExisting,
        ),
        cloneSerializableValue(browserRunProgress.value),
        options,
      )
    }

    async function persistBrowserRunRecord(
      record: BrowserScrapeRecord,
      listingAudit: ExtensionRunListingAudit,
    ) {
      throwIfBrowserRunStopped(controller)
      await onListingAudit(listingAudit)
      throwIfBrowserRunStopped(controller)
      await onRecord(record, listingAudit)
      throwIfBrowserRunStopped(controller)
      await emitBrowserRunProgress()
    }

    async function scrapeDetailPage(
      crawlTabId: number,
      record: BrowserScrapeRecord,
      options: { pass: 'initial' | 'retry' },
    ) {
      throwIfBrowserRunStopped(controller)
      let recordToPersist = record
      const hasDetailFollowFields = draft.config.fields.some(
        (field) => field.scope === 'detail-follow',
      )

      try {
        const readyTab = await navigateTab(crawlTabId, record.url!, {
          timeoutMs: DETAIL_PAGE_NAV_TIMEOUT_MS,
          allowPartialLoad: true,
        })
        const detailResult = await sendToTab<DetailPageExtractResponse>(readyTab, {
          type: 'EXTENSION_EXTRACT_DETAIL_PAGE',
          request: { draft, presetId },
        })

        recordDebugEvent(
          options.pass === 'retry'
            ? 'browser-scrape-detail-page-retry'
            : 'browser-scrape-detail-page',
          options.pass === 'retry'
            ? 'Retried a detail page in the browser run.'
            : 'Scraped a detail page in the browser run.',
          {
            url: detailResult.pageUrl,
            pageState: detailResult.analysis.pageState,
            imageCount: detailResult.analysis.stats.distinctImageCount,
            fieldCount: detailResult.analysis.fields.length,
          },
        )

        if (detailResult.analysis.pageState === 'challenge') {
          throw new Error(
            detailResult.analysis.stateMessage ||
              `The browser scrape hit a challenge page while opening ${record.url}.`,
          )
        }

        recordToPersist = mergeBrowserRecord(record, detailResult.record)
        searchWarnings.push(...detailResult.warnings)

        if (
          hasDetailFollowFields &&
          detailResult.followPageUrl &&
          isAllowedDomainUrl(detailResult.followPageUrl, allowedDomains)
        ) {
          const followTab = await navigateTab(crawlTabId, detailResult.followPageUrl, {
            timeoutMs: DETAIL_PAGE_NAV_TIMEOUT_MS,
            allowPartialLoad: true,
          })
          const followResult = await sendToTab<DetailPageExtractResponse>(followTab, {
            type: 'EXTENSION_EXTRACT_DETAIL_PAGE',
            request: { draft, presetId, scope: 'detail-follow' },
          })

          recordDebugEvent(
            options.pass === 'retry'
              ? 'browser-scrape-detail-follow-page-retry'
              : 'browser-scrape-detail-follow-page',
            options.pass === 'retry'
              ? 'Retried a follow page in the browser run.'
              : 'Scraped a follow page in the browser run.',
            {
              url: followResult.pageUrl,
              pageState: followResult.analysis.pageState,
              imageCount: followResult.analysis.stats.distinctImageCount,
              fieldCount: followResult.analysis.fields.length,
            },
          )

          if (followResult.analysis.pageState === 'challenge') {
            throw new Error(
              followResult.analysis.stateMessage ||
                `The browser scrape hit a challenge page while opening ${detailResult.followPageUrl}.`,
            )
          }

          recordToPersist = mergeBrowserRecord(recordToPersist, followResult.record)
          searchWarnings.push(...followResult.warnings)
        } else if (
          hasDetailFollowFields &&
          detailResult.followPageUrl &&
          !isAllowedDomainUrl(detailResult.followPageUrl, allowedDomains)
        ) {
          searchWarnings.push(
            `Blocked cross-domain follow page during browser scrape: ${detailResult.followPageUrl}`,
          )
        }

        recordToPersist = normalizePresetRecord(presetId, recordToPersist, {
          context: 'detail',
          pageUrl: detailResult.pageUrl,
        })
      } catch (error: unknown) {
        searchWarnings.push(
          error instanceof Error
            ? error.message
            : `Could not scrape the detail page for ${record.url}.`,
        )
      }

      if (options.pass === 'initial' && shouldRetryWeakDetailRecord(recordToPersist)) {
        queueDetailRetry(recordToPersist)
      }

      return recordToPersist
    }
    if (!draft.config.startUrls.length) {
      throw new Error('Add at least one start URL before starting a browser scrape.')
    }

    const allowedDomains = uniqueStrings([
      ...draft.config.allowedDomains,
      ...draft.config.startUrls.map((url) => {
        try {
          return new URL(url).hostname
        } catch {
          return ''
        }
      }),
    ])
    const searchRecords: BrowserScrapeRecord[] = []
    const searchWarnings: string[] = []
    const visitedUrls: string[] = []
    const seenSearchUrls = new Set<string>()
    let pagesVisited = 0
    let itemsSeen = 0
    const crawlTab = await getVisibleCrawlTab(draft.config.startUrls[0]!)
    if (!crawlTab.id) {
      throw new Error('Could not open the active scraper tab.')
    }

    if (draft.config.detailBackfillMode) {
      const detailQueue = draft.config.startUrls.slice(0, draft.config.maxItemsPerRun)
      const validDetailUrls: string[] = []
      for (const url of detailQueue) {
        if (!isAllowedDomainUrl(url, allowedDomains)) {
          searchWarnings.push(`Blocked cross-domain detail backfill URL: ${url}`)
          continue
        }
        validDetailUrls.push(url)
      }

      if (!validDetailUrls.length) {
        throw new Error(
          'Detail backfill has no allowed URLs. Check allowed domains and YachtWorld detail links.',
        )
      }

      itemsSeen = validDetailUrls.length
      detailPagesTotal = validDetailUrls.length
      visitedUrls.push(...validDetailUrls)

      for (let idx = 0; idx < validDetailUrls.length; idx++) {
        throwIfBrowserRunStopped(controller)
        const detailUrl = validDetailUrls[idx]!
        const seedRecord = buildYachtWorldDetailBackfillSeedRecord(draft, detailUrl)
        searchRecords.push(seedRecord)
        const recordIndex = searchRecords.length - 1
        const recordIdentity = buildBrowserRecordIdentity(seedRecord)
        listingDuplicateDecisions.set(recordIdentity, 'new')
        listingPageNumbers.set(recordIdentity, idx + 1)

        await onListingAudit(
          buildListingAuditFromRecord(runId, seedRecord, {
            pageNumber: idx + 1,
            duplicateDecision: 'new',
            detailStatus: 'queued',
            detailAttempts: 0,
            retryQueued: false,
            auditJson: {
              stage: 'detail_backfill',
              detailUrl,
            },
          }),
        )

        browserRunProgress.value = {
          stage: 'detail_backfill',
          currentUrl: detailUrl,
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          skippedExisting: runState.skippedExisting,
          detailPagesCompleted,
          detailPagesTotal,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        }
        statusMessage.value = `Detail backfill ${detailPagesCompleted + 1} of ${detailPagesTotal}: ${detailUrl}`
        await emitBrowserRunProgress()

        const recordToPersist = await scrapeDetailPage(crawlTab.id, seedRecord, {
          pass: 'initial',
        })
        searchRecords.splice(recordIndex, 1, recordToPersist)

        const retryQueued = detailRetryQueue.includes(buildBrowserRecordIdentity(recordToPersist))

        detailPagesCompleted += 1
        browserRunProgress.value = {
          stage: 'detail_backfill',
          currentUrl: detailUrl,
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          skippedExisting: runState.skippedExisting,
          detailPagesCompleted,
          detailPagesTotal,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        }

        await persistBrowserRunRecord(
          recordToPersist,
          buildListingAuditFromRecord(runId, recordToPersist, {
            pageNumber: idx + 1,
            duplicateDecision: 'new',
            detailStatus: retryQueued ? 'retry_queued' : 'scraped',
            detailAttempts: 1,
            retryQueued,
            auditJson: {
              stage: 'detail_backfill',
              followPageAttempted: draft.config.fields.some(
                (field) => field.scope === 'detail-follow',
              ),
            },
          }),
        )
      }

      if (detailRetryQueue.length) {
        detailPagesTotal += detailRetryQueue.length

        for (const identity of detailRetryQueue) {
          throwIfBrowserRunStopped(controller)
          const recordIndex = searchRecords.findIndex(
            (record) => buildBrowserRecordIdentity(record) === identity,
          )
          const record = recordIndex >= 0 ? searchRecords[recordIndex] : null

          if (!record?.url) {
            continue
          }
          const duplicateDecision = listingDuplicateDecisions.get(identity) || 'new'
          const discoveredOnPage = listingPageNumbers.get(identity) ?? null

          browserRunProgress.value = {
            stage: 'detail_backfill',
            currentUrl: record.url,
            pagesVisited,
            itemsSeen,
            itemsExtracted: searchRecords.length,
            skippedExisting: runState.skippedExisting,
            detailPagesCompleted,
            detailPagesTotal,
            recordsPersisted: runState.recordsPersisted,
            imagesUploaded: runState.imagesUploaded,
          }
          statusMessage.value = `Retrying weak detail backfill ${detailPagesCompleted + 1} of ${detailPagesTotal}: ${record.url}`
          await emitBrowserRunProgress({
            eventType: 'detail_retry_started',
            message: `Retrying weak detail page for ${record.url}`,
            pageNumber: discoveredOnPage,
            searchUrl: record.url,
          })

          const refreshedRecord = await scrapeDetailPage(crawlTab.id, record, {
            pass: 'retry',
          })
          searchRecords.splice(recordIndex, 1, refreshedRecord)

          if (shouldRetryWeakDetailRecord(refreshedRecord)) {
            searchWarnings.push(`Detail retry still produced a weak record for ${record.url}.`)
          }

          detailPagesCompleted += 1
          browserRunProgress.value = {
            stage: 'detail_backfill',
            currentUrl: record.url,
            pagesVisited,
            itemsSeen,
            itemsExtracted: searchRecords.length,
            skippedExisting: runState.skippedExisting,
            detailPagesCompleted,
            detailPagesTotal,
            recordsPersisted: runState.recordsPersisted,
            imagesUploaded: runState.imagesUploaded,
          }
          await persistBrowserRunRecord(
            refreshedRecord,
            buildListingAuditFromRecord(runId, refreshedRecord, {
              pageNumber: discoveredOnPage,
              duplicateDecision,
              detailStatus: 'retry_scraped',
              detailAttempts: 2,
              retryQueued: false,
              auditJson: {
                stage: 'detail_backfill-retry',
                pageUrl: record.url,
              },
            }),
          )
          await emitBrowserRunProgress({
            eventType: 'detail_retry_finished',
            message: `Finished retrying detail page for ${record.url}`,
            pageNumber: discoveredOnPage,
            searchUrl: record.url,
          })
        }
      }

      return {
        summary: buildBrowserScrapeSummarySnapshot(
          searchWarnings,
          searchRecords,
          visitedUrls,
          pagesVisited,
          itemsSeen,
          runState.skippedExisting,
        ),
      }
    }

    for (const startUrl of draft.config.startUrls) {
      let currentUrl: string | null = startUrl
      let pageIndex = 0

      while (
        currentUrl &&
        pageIndex < draft.config.maxPages &&
        shouldContinueBrowserSearchPagination({
          fetchDetailPages: draft.config.fetchDetailPages,
          searchRecordCount: searchRecords.length,
          maxItemsPerRun: draft.config.maxItemsPerRun,
        })
      ) {
        throwIfBrowserRunStopped(controller)
        if (!isAllowedDomainUrl(currentUrl, allowedDomains)) {
          searchWarnings.push(`Blocked cross-domain page during browser scrape: ${currentUrl}`)
          break
        }

        if (seenSearchUrls.has(currentUrl)) {
          searchWarnings.push(`Stopped pagination loop at ${currentUrl}`)
          break
        }

        assignSearchBrowserRunProgress(currentUrl)
        statusMessage.value = `Scraping search results in the active browser tab: ${currentUrl}`

        const readyTab = await navigateTab(crawlTab.id, currentUrl, {
          timeoutMs: SEARCH_PAGE_NAV_TIMEOUT_MS,
          allowPartialLoad: true,
        })
        const pageResult = await sendToTab<SearchPageExtractResponse>(readyTab, {
          type: 'EXTENSION_EXTRACT_SEARCH_PAGE',
          request: { draft, presetId },
        })

        recordDebugEvent(
          'browser-scrape-search-page',
          'Scraped a search page in the browser run.',
          {
            url: pageResult.pageUrl,
            pageState: pageResult.analysis.pageState,
            itemCount: pageResult.itemCount,
            extractedRecords: pageResult.records.length,
            nextPageUrl: pageResult.nextPageUrl,
          },
        )

        if (pageResult.analysis.pageState === 'challenge') {
          throw new Error(
            pageResult.analysis.stateMessage ||
              `The browser scrape hit a challenge page on ${pageResult.pageUrl}.`,
          )
        }

        seenSearchUrls.add(pageResult.pageUrl)
        visitedUrls.push(pageResult.pageUrl)
        pagesVisited += 1
        pageIndex += 1
        const currentPageNumber = pageIndex
        itemsSeen += pageResult.itemCount
        searchWarnings.push(...pageResult.warnings)
        assignSearchBrowserRunProgress(pageResult.pageUrl)

        recordDebugEvent(
          'browser-scrape-listing-cards',
          'Counted listing cards on the search page.',
          {
            url: pageResult.pageUrl,
            itemCount: pageResult.itemCount,
            listingCardCount: pageResult.analysis.stats.listingCardCount,
          },
        )

        let skippedExistingOnPage = 0
        const pageRecordIndexes: number[] = []
        for (const record of pageResult.records) {
          throwIfBrowserRunStopped(controller)
          if (
            !shouldContinueBrowserSearchPagination({
              fetchDetailPages: draft.config.fetchDetailPages,
              searchRecordCount: searchRecords.length,
              maxItemsPerRun: draft.config.maxItemsPerRun,
            })
          ) {
            break
          }

          const shouldRefreshExisting = consumeRefreshableBoatIdentity(
            existingIdentityState,
            record,
          )

          if (hasKnownBoatIdentity(existingIdentityState, record) && !shouldRefreshExisting) {
            runState.skippedExisting += 1
            skippedExistingOnPage += 1
            await onListingAudit(
              buildListingAuditFromRecord(runId, record, {
                pageNumber: currentPageNumber,
                duplicateDecision: 'known_duplicate_skipped',
                detailStatus: 'not_attempted',
                detailAttempts: 0,
                retryQueued: false,
                auditJson: {
                  pageUrl: pageResult.pageUrl,
                  stage: 'search',
                },
              }),
            )
            continue
          }

          rememberBoatIdentity(existingIdentityState, record)
          searchRecords.push(record)
          const recordIndex = searchRecords.length - 1
          pageRecordIndexes.push(recordIndex)
          const duplicateDecision = shouldRefreshExisting ? 'weak_existing_refresh' : 'new'
          const recordIdentity = buildBrowserRecordIdentity(record)
          listingDuplicateDecisions.set(recordIdentity, duplicateDecision)
          listingPageNumbers.set(recordIdentity, currentPageNumber)
          await onListingAudit(
            buildListingAuditFromRecord(runId, record, {
              pageNumber: currentPageNumber,
              duplicateDecision,
              detailStatus: draft.config.fetchDetailPages ? 'queued' : 'scraped',
              detailAttempts: 0,
              retryQueued: false,
              auditJson: {
                pageUrl: pageResult.pageUrl,
                stage: 'search',
              },
            }),
          )
          recordDebugEvent(
            'browser-scrape-listing-url',
            'Extracted a listing URL during the browser run.',
            {
              url: record.url,
            },
          )

          if (draft.config.fetchDetailPages) {
            continue
          }

          assignSearchBrowserRunProgress(pageResult.pageUrl)
          await persistBrowserRunRecord(
            record,
            buildListingAuditFromRecord(runId, record, {
              pageNumber: currentPageNumber,
              duplicateDecision,
              detailStatus: 'scraped',
              detailAttempts: 0,
              retryQueued: false,
              auditJson: {
                pageUrl: pageResult.pageUrl,
                stage: 'search',
                persistedWithoutDetailPage: true,
              },
            }),
          )
        }

        if (skippedExistingOnPage > 0) {
          recordDebugEvent(
            'browser-scrape-existing-skipped',
            'Skipped listings that were already ingested.',
            {
              url: pageResult.pageUrl,
              skippedExisting: skippedExistingOnPage,
              totalSkippedExisting: runState.skippedExisting,
            },
          )
        }

        if (draft.config.fetchDetailPages) {
          const pageDetailIndexSet = new Set(
            pageRecordIndexes.filter((index) => Boolean(searchRecords[index]?.url)),
          )

          detailPagesTotal += pageDetailIndexSet.size
          assignSearchBrowserRunProgress(pageResult.pageUrl)
          await emitBrowserRunProgress()

          for (const recordIndex of pageRecordIndexes) {
            throwIfBrowserRunStopped(controller)
            const record = searchRecords[recordIndex]
            if (!record) {
              continue
            }
            const recordIdentity = buildBrowserRecordIdentity(record)
            const duplicateDecision = listingDuplicateDecisions.get(recordIdentity) || 'new'
            const discoveredOnPage = listingPageNumbers.get(recordIdentity) ?? currentPageNumber

            if (!record.url) {
              assignSearchBrowserRunProgress(pageResult.pageUrl)
              await persistBrowserRunRecord(
                record,
                buildListingAuditFromRecord(runId, record, {
                  pageNumber: discoveredOnPage,
                  duplicateDecision,
                  detailStatus: 'not_attempted',
                  detailAttempts: 0,
                  retryQueued: false,
                  auditJson: {
                    pageUrl: pageResult.pageUrl,
                    stage: 'detail',
                    reason: 'missing-detail-url',
                  },
                }),
              )
              continue
            }

            if (!pageDetailIndexSet.has(recordIndex)) {
              continue
            }

            if (!isAllowedDomainUrl(record.url, allowedDomains)) {
              searchWarnings.push(
                `Blocked cross-domain detail page during browser scrape: ${record.url}`,
              )
              detailPagesCompleted += 1
              browserRunProgress.value = {
                stage: 'detail',
                currentUrl: record.url,
                pagesVisited,
                itemsSeen,
                itemsExtracted: searchRecords.length,
                skippedExisting: runState.skippedExisting,
                detailPagesCompleted,
                detailPagesTotal,
                recordsPersisted: runState.recordsPersisted,
                imagesUploaded: runState.imagesUploaded,
              }
              await persistBrowserRunRecord(
                record,
                buildListingAuditFromRecord(runId, record, {
                  pageNumber: discoveredOnPage,
                  duplicateDecision,
                  detailStatus: 'failed',
                  detailAttempts: 1,
                  retryQueued: false,
                  error: `Blocked cross-domain detail page during browser scrape: ${record.url}`,
                  auditJson: {
                    pageUrl: pageResult.pageUrl,
                    stage: 'detail',
                    blockedDetailUrl: record.url,
                  },
                }),
              )
              continue
            }

            browserRunProgress.value = {
              stage: 'detail',
              currentUrl: record.url,
              pagesVisited,
              itemsSeen,
              itemsExtracted: searchRecords.length,
              skippedExisting: runState.skippedExisting,
              detailPagesCompleted,
              detailPagesTotal,
              recordsPersisted: runState.recordsPersisted,
              imagesUploaded: runState.imagesUploaded,
            }
            statusMessage.value = `Scraping detail page ${detailPagesCompleted + 1} of ${detailPagesTotal} in the active tab: ${record.url}`
            const recordToPersist = await scrapeDetailPage(crawlTab.id, record, {
              pass: 'initial',
            })
            searchRecords.splice(recordIndex, 1, recordToPersist)
            const retryQueued = detailRetryQueue.includes(buildBrowserRecordIdentity(recordToPersist))

            detailPagesCompleted += 1
            browserRunProgress.value = {
              stage: 'detail',
              currentUrl: record.url,
              pagesVisited,
              itemsSeen,
              itemsExtracted: searchRecords.length,
              skippedExisting: runState.skippedExisting,
              detailPagesCompleted,
              detailPagesTotal,
              recordsPersisted: runState.recordsPersisted,
              imagesUploaded: runState.imagesUploaded,
            }
            await persistBrowserRunRecord(
              recordToPersist,
              buildListingAuditFromRecord(runId, recordToPersist, {
                pageNumber: discoveredOnPage,
                duplicateDecision,
                detailStatus: retryQueued ? 'retry_queued' : 'scraped',
                detailAttempts: 1,
                retryQueued,
                auditJson: {
                  pageUrl: pageResult.pageUrl,
                  stage: 'detail',
                  followPageAttempted: draft.config.fields.some(
                    (field) => field.scope === 'detail-follow',
                  ),
                },
              }),
            )
          }
        } else {
          await emitBrowserRunProgress()
        }

        currentUrl = pageResult.nextPageUrl
      }
    }

    if (detailRetryQueue.length) {
      detailPagesTotal += detailRetryQueue.length

      for (const identity of detailRetryQueue) {
        throwIfBrowserRunStopped(controller)
        const recordIndex = searchRecords.findIndex(
          (record) => buildBrowserRecordIdentity(record) === identity,
        )
        const record = recordIndex >= 0 ? searchRecords[recordIndex] : null

        if (!record?.url) {
          continue
        }
        const duplicateDecision = listingDuplicateDecisions.get(identity) || 'new'
        const discoveredOnPage = listingPageNumbers.get(identity) ?? null

        browserRunProgress.value = {
          stage: 'detail',
          currentUrl: record.url,
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          skippedExisting: runState.skippedExisting,
          detailPagesCompleted,
          detailPagesTotal,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        }
        statusMessage.value = `Retrying weak detail page ${detailPagesCompleted + 1} of ${detailPagesTotal} in the active tab: ${record.url}`
        await emitBrowserRunProgress({
          eventType: 'detail_retry_started',
          message: `Retrying weak detail page for ${record.url}`,
          pageNumber: discoveredOnPage,
          searchUrl: record.url,
        })

        const refreshedRecord = await scrapeDetailPage(crawlTab.id, record, {
          pass: 'retry',
        })
        searchRecords.splice(recordIndex, 1, refreshedRecord)

        if (shouldRetryWeakDetailRecord(refreshedRecord)) {
          searchWarnings.push(`Detail retry still produced a weak record for ${record.url}.`)
        }

        detailPagesCompleted += 1
        browserRunProgress.value = {
          stage: 'detail',
          currentUrl: record.url,
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          skippedExisting: runState.skippedExisting,
          detailPagesCompleted,
          detailPagesTotal,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        }
        await persistBrowserRunRecord(
          refreshedRecord,
          buildListingAuditFromRecord(runId, refreshedRecord, {
            pageNumber: discoveredOnPage,
            duplicateDecision,
            detailStatus: 'retry_scraped',
            detailAttempts: 2,
            retryQueued: false,
            auditJson: {
              stage: 'detail-retry',
              pageUrl: record.url,
            },
          }),
        )
        await emitBrowserRunProgress({
          eventType: 'detail_retry_finished',
          message: `Finished retrying detail page for ${record.url}`,
          pageNumber: discoveredOnPage,
          searchUrl: record.url,
        })
      }
    }

    if (itemsSeen === 0) {
      throw new Error(
        `The browser scrape found zero listing cards across ${pagesVisited || 1} page${pagesVisited === 1 ? '' : 's'}. Re-scan the search page and confirm the listing-card selector matches live results.`,
      )
    }

    if (!searchRecords.length) {
      throw new Error(
        'The browser scrape found listing cards but could not extract any listing URLs. Re-scan the title and URL mappings on the search page before running again.',
      )
    }

    return {
      summary: buildBrowserScrapeSummarySnapshot(
        searchWarnings,
        searchRecords,
        visitedUrls,
        pagesVisited,
        itemsSeen,
        runState.skippedExisting,
      ),
    }
  }

  async function handoffToBoatSearch() {
    errorMessage.value = ''
    statusMessage.value = 'Preparing the trusted preset draft for Boat Search...'

    try {
      await ensureTrustedPresetLoaded()
      const url = buildImportUrl(session.value.appBaseUrl, session.value.draft)
      await chrome.runtime.sendMessage({
        type: 'EXTENSION_OPEN_URL',
        url,
      } satisfies BackgroundMessage)
      statusMessage.value = 'Draft sent to Boat Search.'
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not open Boat Search with the draft.'
      errorMessage.value = message
      statusMessage.value = 'App handoff failed'
    }
  }

  async function openBoatSearchAccountSettings() {
    errorMessage.value = ''
    statusMessage.value = 'Opening Boat Search account settings...'

    try {
      const base = getBoatSearchBaseUrl(session.value)
      if (!base) {
        throw new Error('Set the Boat Search app URL before opening account settings.')
      }

      await chrome.runtime.sendMessage({
        type: 'EXTENSION_OPEN_URL',
        url: `${base}/account/settings`,
      } satisfies BackgroundMessage)
      statusMessage.value = 'Boat Search account settings opened.'
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Could not open Boat Search account settings.'
      errorMessage.value = message
      statusMessage.value = 'Account settings handoff failed'
    }
  }

  function throwIfBrowserRunStopped(controller: ActiveBrowserRunController | null) {
    if (controller?.stopRequested) {
      throw new BrowserRunStoppedError()
    }
  }

  function stopScrapeInBoatSearch() {
    const controller = activeBrowserRunController.value
    if (!controller || (!startingRemoteRun.value && !browserRunProgress.value)) {
      return
    }

    if (controller.stopRequested) {
      return
    }

    controller.stopRequested = true
    stoppingRemoteRun.value = true
    errorMessage.value = ''
    statusMessage.value = 'Stopping browser scrape after the current step finishes...'
    void persistBrowserRunStopToBoatSearch(activeRemoteRunMeta.value, BROWSER_RUN_STOP_MESSAGE).catch(
      () => {},
    )
    recordDebugEvent('browser-scrape-stop-requested', 'User requested that the browser scrape stop.')
  }

  async function startScrapeInBoatSearch() {
    errorMessage.value = ''
    startingRemoteRun.value = true
    stoppingRemoteRun.value = false
    remoteRun.value = null
    activeRemoteRunMeta.value = null
    browserRunProgress.value = null
    statusMessage.value = 'Verifying the Boat Search connection...'
    const runController: ActiveBrowserRunController = { stopRequested: false }
    activeBrowserRunController.value = runController
    let activeRun: ExtensionRunStartResponse | null = null
    let activeDraft: ScraperPipelineDraft | null = null
    let activePresetId: SitePresetId | null = null
    const scrapedRecords: BrowserScrapeRecord[] = []
    const runState = {
      inserted: 0,
      updated: 0,
      recordsPersisted: 0,
      imagesUploaded: 0,
      skippedExisting: 0,
      persistedIdentities: new Set<string>(),
    }

    try {
      await ensureTrustedPresetLoaded()
      throwIfBrowserRunStopped(runController)

      if (!session.value.connection.apiKey.trim()) {
        throw new Error('Add a Boat Search API key before starting a browser scrape.')
      }

      const runtimeConfig = resolveBrowserScrapeRuntimeConfig(
        session.value,
        cloneSerializableValue(session.value.draft),
      )
      const draft = runtimeConfig.draft
      activeDraft = draft
      activePresetId = runtimeConfig.presetId
      if (runtimeConfig.usedRuntimePresetOverride && activePresetId) {
        recordDebugEvent(
          'browser-scrape-runtime-preset-applied',
          `Using the matched ${getSitePresetLabel(activePresetId) || 'trusted'} preset selectors for the browser scrape.`,
          {
            presetId: activePresetId,
          },
        )
      }
      const authStatus = await verifyBoatSearchConnection(true)
      throwIfBrowserRunStopped(runController)
      const imageUploadEnabled = Boolean(authStatus?.imageUploadEnabled)

      const run = await fetchBoatSearchJson<ExtensionRunStartResponse>(
        '/api/admin/scraper-extension/run/start',
        {
          method: 'POST',
          body: JSON.stringify({ draft }),
        },
      )
      activeRun = run
      activeRemoteRunMeta.value = {
        pipelineId: run.pipelineId,
        jobId: run.jobId,
      }
      throwIfBrowserRunStopped(runController)
      const existingIdentityState = createBrowserRunIdentityState(
        run.existingBoatIdentities,
        run.refreshableBoatIdentities,
      )
      recordDebugEvent(
        'browser-scrape-started',
        'Boat Search accepted the browser scrape run.',
        {
          pipelineId: run.pipelineId,
          jobId: run.jobId,
          knownListingIds: existingIdentityState.knownListingIds.size,
          knownNormalizedUrls: existingIdentityState.knownNormalizedUrls.size,
          refreshableListingIds: existingIdentityState.refreshableListingIds.size,
          refreshableNormalizedUrls: existingIdentityState.refreshableNormalizedUrls.size,
        },
      )
      if (!imageUploadEnabled) {
        recordDebugEvent(
          'browser-scrape-images-preserved',
          'Boat Search image mirroring is unavailable here, so the scrape will keep source image URLs.',
        )
      }
      statusMessage.value = 'Scraping the site in the active browser tab...'
      const browserRun = await crawlDraftInBrowser(
        run.jobId,
        draft,
        activePresetId,
        runState,
        existingIdentityState,
        runController,
        async (record, listing) => {
          throwIfBrowserRunStopped(runController)
          upsertBrowserRunRecord(scrapedRecords, cloneSerializableValue(record))
          const persisted = await persistBrowserRecordToBoatSearch(run, draft, listing, record)
          throwIfBrowserRunStopped(runController)
          runState.imagesUploaded += persisted.imagesUploaded
          runState.inserted += persisted.inserted
          runState.updated += persisted.updated
          const identity = buildBrowserRecordIdentity(record)
          if (!runState.persistedIdentities.has(identity)) {
            runState.persistedIdentities.add(identity)
            runState.recordsPersisted += 1
          }
          browserRunProgress.value = browserRunProgress.value
            ? {
                ...browserRunProgress.value,
                recordsPersisted: runState.recordsPersisted,
                imagesUploaded: runState.imagesUploaded,
              }
            : null
        },
        async (listing) => {
          throwIfBrowserRunStopped(runController)
          await persistBrowserListingAuditToBoatSearch(run, listing)
        },
        async (summary, progress, options) => {
          throwIfBrowserRunStopped(runController)
          await persistBrowserRunProgressToBoatSearch(run, summary, progress, runState, options)
        },
      )
      throwIfBrowserRunStopped(runController)
      const summary = {
        ...browserRun.summary,
        warnings: imageUploadEnabled
          ? browserRun.summary.warnings
          : uniqueStrings([
              ...browserRun.summary.warnings,
              'Boat Search image mirroring is unavailable in this environment, so the scrape kept the source image URLs.',
            ]),
      } satisfies BrowserScrapeSummary
      browserRunProgress.value = {
        stage: 'upload',
        currentUrl: null,
        pagesVisited: summary.pagesVisited,
        itemsSeen: summary.itemsSeen,
        itemsExtracted: summary.itemsExtracted,
        skippedExisting: summary.skippedExisting,
        detailPagesCompleted: draft.config.fetchDetailPages ? runState.recordsPersisted : 0,
        detailPagesTotal: draft.config.fetchDetailPages ? summary.itemsExtracted : 0,
        recordsPersisted: runState.recordsPersisted,
        imagesUploaded: runState.imagesUploaded,
      }
      if (browserRunProgress.value) {
        await persistBrowserRunProgressToBoatSearch(
          run,
          summary,
          cloneSerializableValue(browserRunProgress.value),
          runState,
        )
      }
      statusMessage.value = 'Finalizing the browser scrape in Boat Search...'

      const response = await fetchBoatSearchJson<ExtensionRunCompleteResponse>(
        '/api/admin/scraper-extension/run/complete',
        {
          method: 'POST',
          body: JSON.stringify({
            pipelineId: run.pipelineId,
            jobId: run.jobId,
            draft,
            summary,
            inserted: runState.inserted,
            updated: runState.updated,
          }),
        },
      )
      remoteRun.value = {
        pipelineId: run.pipelineId,
        jobId: response.jobId,
        summary: response.summary,
      }
      activeRemoteRunMeta.value = null
      browserRunProgress.value = null
      statusMessage.value =
        response.summary.skippedExisting > 0
          ? `Browser scrape complete. Inserted ${response.summary.inserted}, updated ${response.summary.updated}, and skipped ${response.summary.skippedExisting} existing boats.`
          : `Browser scrape complete. Inserted ${response.summary.inserted} and updated ${response.summary.updated} boats.`
      recordDebugEvent(
        'browser-scrape-complete',
        'Completed the browser scrape and Boat Search finalization.',
        {
          pipelineId: run.pipelineId,
          jobId: response.jobId,
          pagesVisited: response.summary.pagesVisited,
          itemsSeen: response.summary.itemsSeen,
          itemsExtracted: response.summary.itemsExtracted,
          skippedExisting: response.summary.skippedExisting,
          inserted: response.summary.inserted,
          updated: response.summary.updated,
        },
      )
      return
    } catch (error: unknown) {
      if (isBrowserRunStoppedError(error)) {
        const progressSnapshot = browserRunProgress.value
        if (activeRun && activeDraft) {
          try {
            await fetchBoatSearchJson('/api/admin/scraper-extension/run/fail', {
              method: 'POST',
              body: JSON.stringify({
                pipelineId: activeRun.pipelineId,
                jobId: activeRun.jobId,
                draft: activeDraft,
                summary: {
                  pagesVisited: browserRunProgress.value?.pagesVisited ?? 0,
                  itemsSeen: browserRunProgress.value?.itemsSeen ?? 0,
                  itemsExtracted: browserRunProgress.value?.itemsExtracted ?? 0,
                  skippedExisting: browserRunProgress.value?.skippedExisting ?? runState.skippedExisting,
                  visitedUrls: [],
                  warnings: [],
                },
                inserted: runState.inserted,
                updated: runState.updated,
                error: BROWSER_RUN_STOP_MESSAGE,
              }),
            })
          } catch {
            // Ignore stop-finalization issues and surface the local stop state.
          }
        }

        browserRunProgress.value = null
        remoteRun.value = null
        activeRemoteRunMeta.value = null
        errorMessage.value = ''
        statusMessage.value = 'Browser scrape stopped.'
        recordDebugEvent('browser-scrape-stopped', BROWSER_RUN_STOP_MESSAGE, {
          pagesVisited: progressSnapshot?.pagesVisited ?? 0,
          itemsSeen: progressSnapshot?.itemsSeen ?? 0,
          itemsExtracted: progressSnapshot?.itemsExtracted ?? 0,
          skippedExisting: progressSnapshot?.skippedExisting ?? runState.skippedExisting,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        })
        return
      }

      const fallbackDraft = activeDraft ? cloneSerializableValue(activeDraft) : cloneSerializableValue(session.value.draft)
      if (isBoatSearchRequestError(error)) {
        try {
          await runCsvFallbackScrape(
            fallbackDraft,
            activePresetId,
            error.message,
            scrapedRecords,
          )
          return
        } catch (fallbackError: unknown) {
          recordDebugEvent(
            'browser-scrape-csv-fallback-failed',
            fallbackError instanceof Error
              ? fallbackError.message
              : 'The CSV fallback scrape failed.',
          )
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : 'The CSV fallback scrape failed.'
          errorMessage.value = `${error.message} The CSV fallback also failed: ${fallbackMessage}`
          statusMessage.value = 'Browser scrape failed'
          recordDebugEvent('browser-scrape-failed', errorMessage.value, {
            pagesVisited: browserRunProgress.value?.pagesVisited ?? 0,
            itemsSeen: browserRunProgress.value?.itemsSeen ?? 0,
            itemsExtracted: browserRunProgress.value?.itemsExtracted ?? 0,
            skippedExisting: browserRunProgress.value?.skippedExisting ?? runState.skippedExisting,
            recordsPersisted: runState.recordsPersisted,
            imagesUploaded: runState.imagesUploaded,
          })
          return
        }
      }
      if (browserRunProgress.value && activeRun && activeDraft) {
        try {
          await fetchBoatSearchJson('/api/admin/scraper-extension/run/fail', {
            method: 'POST',
            body: JSON.stringify({
              pipelineId: activeRun.pipelineId,
              jobId: activeRun.jobId,
              draft: activeDraft,
              summary: {
                pagesVisited: browserRunProgress.value.pagesVisited,
                itemsSeen: browserRunProgress.value.itemsSeen,
                itemsExtracted: browserRunProgress.value.itemsExtracted,
                skippedExisting: browserRunProgress.value.skippedExisting,
                visitedUrls: [],
                warnings: [],
              },
              inserted: runState.inserted,
              updated: runState.updated,
              error:
                error instanceof Error
                  ? error.message
                  : 'The browser scrape failed before completion.',
            }),
          })
        } catch {
          // Ignore fail-finalization issues and surface the original scrape error.
        }
      }
      const message =
        error instanceof Error ? error.message : 'Could not finish the browser scrape.'
      errorMessage.value = message
      statusMessage.value = 'Browser scrape failed'
      recordDebugEvent('browser-scrape-failed', message, {
        pagesVisited: browserRunProgress.value?.pagesVisited ?? 0,
        itemsSeen: browserRunProgress.value?.itemsSeen ?? 0,
        itemsExtracted: browserRunProgress.value?.itemsExtracted ?? 0,
        skippedExisting: browserRunProgress.value?.skippedExisting ?? runState.skippedExisting,
        recordsPersisted: runState.recordsPersisted,
        imagesUploaded: runState.imagesUploaded,
      })
    } finally {
      activeRemoteRunMeta.value = null
      activeBrowserRunController.value = null
      startingRemoteRun.value = false
      stoppingRemoteRun.value = false
    }
  }

  function updateConnectionApiKey(value: string) {
    session.value.connection.apiKey = value.trim()
    session.value.connection.apiKeySource = 'manual'
    session.value.connection.verifiedAt = null
    session.value.connection.verifiedEmail = null
    session.value.connection.verifiedName = null
    session.value.connection.imageUploadEnabled = false
  }

  function updateAppBaseUrl(value: string) {
    session.value.appBaseUrl = value.trim()
    session.value.appBaseUrlSource = 'manual'
  }

  function clearTransientState() {
    errorMessage.value = ''
    pendingPicker.value = null
    itemSelectorTraining.value = null
    itemSelectorPreview.value = null
    remoteRun.value = null
    activeRemoteRunMeta.value = null
    browserRunProgress.value = null
    sampleDetailRun.value = null
    fixtureCapturePendingOverride.value = null
    capturingFixture.value = false
    stoppingRemoteRun.value = false
    activeBrowserRunController.value = null
    void clearFieldPreview()
  }

  function clearScrapeState() {
    session.value = buildClearedScrapeSession(session.value, createConfiguredDefaultSession())
    statusMessage.value = 'Scrape state cleared. Use Scan current page to analyze the active tab again.'
    clearTransientState()
  }

  function forgetBoatSearchConnection() {
    session.value = buildSessionWithoutConnection(session.value)
    statusMessage.value =
      'Boat Search connection forgotten. Add the app URL and API key again to reconnect.'
    clearTransientState()
  }

  function resetSession() {
    clearScrapeState()
  }

  async function previewItemSelector() {
    errorMessage.value = ''
    const itemSelector = session.value.draft.config.itemSelector.trim()
    if (!itemSelector) {
      itemSelectorPreview.value = {
        selector: '',
        matchCount: 0,
        highlightedCount: 0,
        sampleValues: [],
        active: false,
        error: 'Pick a listing card selector first.',
      }
      return
    }

    try {
      const preview = await sendToActiveTab<FieldPreviewResult>({
        type: 'EXTENSION_PREVIEW_FIELD',
        preview: {
          field: createFieldRule('title', 'item', ':root', {
            required: false,
          }),
          itemSelector,
          mode: 'itemSelector',
        },
      })
      itemSelectorPreview.value = {
        ...preview,
        active: true,
        error: preview.matchCount ? '' : 'No listing cards matched on the current page.',
      }
      statusMessage.value =
        preview.highlightedCount < preview.matchCount
          ? `Previewing ${preview.matchCount} detected listing cards. ${preview.highlightedCount} visible cards are highlighted right now.`
          : `Previewing ${preview.matchCount} detected listing card${preview.matchCount === 1 ? '' : 's'} on the page.`
    } catch (error: unknown) {
      itemSelectorPreview.value = {
        selector: itemSelector,
        matchCount: 0,
        highlightedCount: 0,
        sampleValues: [],
        active: false,
        error: error instanceof Error ? error.message : 'Could not preview the detected cards.',
      }
    }
  }

  async function clearItemSelectorPreview() {
    itemSelectorPreview.value = null
    await clearFieldPreview()
  }

  async function detectItemSelector() {
    errorMessage.value = ''
    itemSelectorTraining.value = null
    itemSelectorPreview.value = null
    statusMessage.value = 'Detecting listing cards on the current page...'

    try {
      const analysis = await sendToActiveTab<AutoDetectedAnalysis>({
        type: 'EXTENSION_ANALYZE_PAGE',
      })

      if (analysis.pageType !== 'search') {
        errorMessage.value = 'Open a search results page before running card detection.'
        statusMessage.value = 'Card detection failed'
        return
      }

      applyAnalysis(analysis)
      statusMessage.value = analysis.itemSelector
        ? `Detected listing card selector: ${analysis.itemSelector}`
        : 'Could not detect a listing card selector automatically. Use training mode.'
    } catch (error: unknown) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Could not detect listing cards on the page.'
      statusMessage.value = 'Card detection failed'
    }
  }

  async function resetItemSelector() {
    session.value.draft.config.itemSelector = ''
    itemSelectorTraining.value = null
    itemSelectorPreview.value = null
    if (pendingPicker.value?.kind === 'itemSelector') {
      pendingPicker.value = null
    }
    errorMessage.value = ''
    statusMessage.value = 'Listing-card selector cleared.'
    await clearFieldPreview()
  }

  return {
    session,
    activeTab,
    itemFields,
    detailFields,
    detailFollowFields,
    pendingPicker,
    fieldPreview,
    itemSelectorTraining,
    itemSelectorPreview,
    remoteRun,
    browserRunProgress,
    debugEvents,
    sampleDetailRun,
    fixtureCapturePendingOverride,
    capturingFixture,
    startingRemoteRun,
    stoppingRemoteRun,
    verifyingConnection,
    statusMessage,
    errorMessage,
    matchedPreset,
    trustedPresetActive,
    presetValidationOptional,
    shouldOfferMatchedPresetLoad,
    loadSession,
    initializeForCurrentTab,
    refreshActiveTab,
    analyzeCurrentPage,
    setSelectedFixtureTemplate,
    updateFixtureCustomLabel,
    captureFixture,
    startPicker,
    previewField,
    clearFieldPreview,
    previewItemSelector,
    clearItemSelectorPreview,
    detectItemSelector,
    resetItemSelector,
    addField,
    removeField,
    openSampleDetailPage,
    verifyBoatSearchConnection,
    applyMatchedPreset,
    updateConnectionApiKey,
    updateAppBaseUrl,
    clearScrapeState,
    forgetBoatSearchConnection,
    startScrapeInBoatSearch,
    stopScrapeInBoatSearch,
    openBoatSearchAccountSettings,
    handoffToBoatSearch,
    resetSession,
  }
}
