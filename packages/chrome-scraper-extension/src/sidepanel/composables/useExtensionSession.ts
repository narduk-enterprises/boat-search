import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { createDefaultSession, createFieldRule } from '@/shared/defaults'
import { buildImportUrl, hostToSourceName } from '@/shared/transfer'
import type {
  AutoDetectedAnalysis,
  BackgroundMessage,
  BrowserScrapeProgress,
  BrowserScrapeRecord,
  BrowserScrapeSummary,
  DetailPageExtractResponse,
  ExtensionAuthStatusResponse,
  ExtensionRunCompleteResponse,
  ExtensionRunRecordResponse,
  ExtensionRunStartResponse,
  FieldPreviewResult,
  SearchPageExtractResponse,
  PickerProgress,
  PickerRequest,
  PickerResult,
  ScraperFieldRule,
  ScraperFieldScope,
  ScraperPipelineDraft,
  ExtensionSession,
} from '@/shared/types'

const STORAGE_KEY = 'boat-search-extension-session-v3'

type FieldPreviewState = FieldPreviewResult & {
  field: ScraperFieldRule
  fieldId: string
  status: 'loading' | 'ready' | 'error'
  error: string
}

type ItemSelectorTrainingState = PickerProgress | null

type ItemSelectorPreviewState = (FieldPreviewResult & {
  active: boolean
  error: string
}) | null

type RemoteRunSummary = {
  pagesVisited: number
  itemsSeen: number
  itemsExtracted: number
  inserted: number
  updated: number
  warnings: string[]
}

type RemoteRunState = {
  pipelineId: number
  jobId: number | null
  summary: RemoteRunSummary
} | null

type BrowserRunProgressState = BrowserScrapeProgress | null

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
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
    const normalizedDomains = allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean)

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

function createBoatSearchHeaders(sessionValue: ExtensionSession, extraHeaders: HeadersInit = {}) {
  const apiKey = sessionValue.connection.apiKey.trim()
  if (!apiKey) {
    throw new Error('Add a Boat Search API key before starting a browser scrape.')
  }

  return {
    'Accept': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
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
      maxPages: toBoundedInteger(rawConfig.maxPages, fallback.config.maxPages, 1, 25),
      maxItemsPerRun: toBoundedInteger(
        rawConfig.maxItemsPerRun,
        fallback.config.maxItemsPerRun,
        1,
        250,
      ),
      fetchDetailPages:
        typeof rawConfig.fetchDetailPages === 'boolean'
          ? rawConfig.fetchDetailPages
          : fallback.config.fetchDetailPages,
      fields: Array.isArray(rawConfig.fields)
        ? rawConfig.fields.map((field: unknown, index: number) =>
            normalizeField(field, fallback.config.fields[index] ?? fallback.config.fields[0]),
          )
        : structuredClone(fallback.config.fields),
    },
  }
}

function normalizeSession(value: unknown): ExtensionSession {
  const fallback = createDefaultSession()
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const raw = value as Partial<ExtensionSession>
  return {
    ...fallback,
    ...raw,
    appBaseUrl: typeof raw.appBaseUrl === 'string' ? raw.appBaseUrl : fallback.appBaseUrl,
    connection:
      raw.connection && typeof raw.connection === 'object'
        ? {
            ...fallback.connection,
            ...raw.connection,
            apiKey:
              typeof raw.connection.apiKey === 'string'
                ? raw.connection.apiKey.trim()
                : fallback.connection.apiKey,
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
    draft: normalizeDraft(raw.draft, fallback.draft),
    lastAnalysis:
      raw.lastAnalysis && typeof raw.lastAnalysis === 'object'
        ? {
            ...raw.lastAnalysis,
            pageType:
              raw.lastAnalysis.pageType === 'detail' || raw.lastAnalysis.pageType === 'unknown'
                ? raw.lastAnalysis.pageType
                : 'search',
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
            fields: Array.isArray(raw.lastAnalysis.fields)
              ? raw.lastAnalysis.fields.map((field, index) =>
                  normalizeField(field, fallback.draft.config.fields[index] ?? fallback.draft.config.fields[0]),
                )
              : [],
          }
        : null,
  }
}

export function useExtensionSession() {
  const session = ref(createDefaultSession())
  const activeTab = shallowRef<chrome.tabs.Tab | null>(null)
  const statusMessage = shallowRef('Ready')
  const errorMessage = shallowRef('')
  const pendingPicker = ref<PickerRequest | null>(null)
  const fieldPreview = shallowRef<FieldPreviewState | null>(null)
  const itemSelectorTraining = shallowRef<ItemSelectorTrainingState>(null)
  const itemSelectorPreview = shallowRef<ItemSelectorPreviewState>(null)
  const remoteRun = shallowRef<RemoteRunState>(null)
  const browserRunProgress = shallowRef<BrowserRunProgressState>(null)
  const startingRemoteRun = shallowRef(false)
  const verifyingConnection = shallowRef(false)
  let previewSequence = 0

  async function loadSession() {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    if (stored[STORAGE_KEY]) {
      session.value = normalizeSession(stored[STORAGE_KEY])
    }
  }

  watch(
    session,
    async (nextSession) => {
      await chrome.storage.local.set({ [STORAGE_KEY]: nextSession })
    },
    { deep: true },
  )

  async function refreshActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    activeTab.value = tab ?? null
    session.value.currentTabUrl = tab?.url || null
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
        throw error
      }

      await ensureContentScript(tab)
      return (await chrome.tabs.sendMessage(tab.id, message)) as T
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

  function applyAnalysis(analysis: AutoDetectedAnalysis) {
    const host = new URL(analysis.pageUrl).hostname
    session.value.currentTabUrl = analysis.pageUrl
    session.value.lastAnalysis = analysis
    session.value.sampleDetailUrl = analysis.sampleDetailUrl
    session.value.draft.boatSource = session.value.draft.boatSource || hostToSourceName(host)
    session.value.draft.name =
      session.value.draft.name || `${hostToSourceName(host)} ${analysis.pageType} pipeline`
    session.value.draft.config.allowedDomains = uniqueStrings([
      ...session.value.draft.config.allowedDomains,
      host,
    ])

    if (analysis.pageType === 'search') {
      session.value.stage = 'search'
      session.value.draft.config.startUrls = [analysis.pageUrl]
      if (analysis.itemSelector) {
        session.value.draft.config.itemSelector = analysis.itemSelector
      }
      if (analysis.nextPageSelector) {
        session.value.draft.config.nextPageSelector = analysis.nextPageSelector
      }
    }

    if (analysis.pageType === 'detail') {
      session.value.stage = 'detail'
      session.value.draft.config.fetchDetailPages = true
    }

    for (const field of analysis.fields) {
      upsertFieldRule(field)
    }
  }

  async function sendToActiveTab<T>(message: object) {
    const tab = await refreshActiveTab()
    if (!tab?.id) {
      throw new Error('Open a normal web page before using the helper.')
    }

    return sendToTab<T>(tab, message)
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
      applyAnalysis(analysis)
      statusMessage.value =
        analysis.pageType === 'unknown'
          ? 'Page analyzed, but detection was inconclusive.'
          : `Detected ${analysis.pageType} selectors for ${analysis.siteName}.`
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'The helper could not connect to the current page.'
      errorMessage.value = message
      statusMessage.value = 'Analysis failed'
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
      const message =
        error instanceof Error ? error.message : 'Could not start the element picker.'
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

  const updatedListener = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
    if (!activeTab.value?.id || activeTab.value.id !== tabId) {
      return
    }

    if (changeInfo.url || changeInfo.status === 'complete') {
      activeTab.value = tab
      session.value.currentTabUrl = tab.url || null
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
    if (scope === 'item') {
      itemFields.value = [...itemFields.value, nextField]
      return
    }

    detailFields.value = [...detailFields.value, nextField]
  }

  function removeField(scope: ScraperFieldScope, index: number) {
    if (scope === 'item') {
      if (itemFields.value.length <= 1) return
      const nextFields = [...itemFields.value]
      nextFields.splice(index, 1)
      itemFields.value = nextFields
      return
    }

    const nextFields = [...detailFields.value]
    nextFields.splice(index, 1)
    detailFields.value = nextFields
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
    const tab = await chrome.tabs.create({ url: targetUrl, active: true })
    session.value.stage = 'detail'
    session.value.currentTabUrl = targetUrl

    if (!tab.id) {
      statusMessage.value = 'Sample detail page opened.'
      return
    }

    try {
      const readyTab = await waitForTabComplete(tab.id)
      const detailAnalysis = await sendToTab<AutoDetectedAnalysis>(readyTab, {
        type: 'EXTENSION_ANALYZE_PAGE',
      })
      applyAnalysis(detailAnalysis)
      statusMessage.value =
        detailAnalysis.pageType === 'detail'
          ? `Scanned the detail page and found ${detailAnalysis.fields.length} field suggestion${detailAnalysis.fields.length === 1 ? '' : 's'}.`
          : 'Opened the sample page, but it did not classify as a detail page. Re-scan after the page settles.'
    } catch (error: unknown) {
      statusMessage.value = 'Sample detail page opened.'
      errorMessage.value =
        error instanceof Error ? error.message : 'Could not auto-scan the detail page.'
    }
  }

  async function waitForTabComplete(tabId: number, timeoutMs = 20_000) {
    const currentTab = await chrome.tabs.get(tabId)
    if (currentTab.status === 'complete') {
      return currentTab
    }

    return await new Promise<chrome.tabs.Tab>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(updatedListener)
        reject(new Error('The detail page took too long to finish loading.'))
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

  async function navigateTab(tabId: number, url: string, timeoutMs = 30_000) {
    const nextTab = await chrome.tabs.update(tabId, { url, active: false })
    if (!nextTab || !nextTab.id) {
      throw new Error('Could not reuse the scraper tab.')
    }

    return await waitForTabComplete(nextTab.id, timeoutMs)
  }

  function mergeBrowserRecord(baseRecord: BrowserScrapeRecord, detailPatch: Partial<BrowserScrapeRecord>) {
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
      'sellerType',
      'listingType',
      'fullText',
    ] as const

    for (const key of scalarKeys) {
      const nextValue = detailPatch[key]
      if (nextValue != null && nextValue !== '') {
        nextRecord[key] = nextValue as never
      }
    }

    return nextRecord
  }

  async function fetchBoatSearchJson<T>(path: string, init: RequestInit = {}) {
    const base = getBoatSearchBaseUrl(session.value)
    if (!base) {
      throw new Error('Set the Boat Search app URL before starting a scrape.')
    }

    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData
    const headers = isFormData
      ? createBoatSearchHeaders(session.value, init.headers || {})
      : createBoatSearchHeaders(session.value, {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        })

    const response = await fetch(`${base}${path}`, {
      ...init,
      headers,
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response))
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
      return result
    } catch (error: unknown) {
      session.value.connection.verifiedAt = null
      session.value.connection.verifiedEmail = null
      session.value.connection.verifiedName = null
      session.value.connection.imageUploadEnabled = false
      throw error
    } finally {
      verifyingConnection.value = false
    }
  }

  function inferFileExtension(contentType: string | null, imageUrl: string) {
    const normalizedType = (contentType || '').toLowerCase()
    if (normalizedType.includes('png')) return 'png'
    if (normalizedType.includes('webp')) return 'webp'
    if (normalizedType.includes('gif')) return 'gif'
    if (normalizedType.includes('avif')) return 'avif'
    if (normalizedType.includes('svg')) return 'svg'
    if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) return 'jpg'

    try {
      const pathname = new URL(imageUrl).pathname
      const match = pathname.match(/\.([a-z0-9]{2,5})$/i)
      return match?.[1]?.toLowerCase() || 'jpg'
    } catch {
      return 'jpg'
    }
  }

  function inferUploadFileName(imageUrl: string, contentType: string | null) {
    try {
      const pathname = new URL(imageUrl).pathname
      const lastSegment = pathname.split('/').filter(Boolean).at(-1) || 'scraped-image'
      const stem = lastSegment.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^a-z0-9-_]+/gi, '-')
      return `${stem || 'scraped-image'}.${inferFileExtension(contentType, imageUrl)}`
    } catch {
      return `scraped-image.${inferFileExtension(contentType, imageUrl)}`
    }
  }

  async function uploadImageToBoatSearch(imageUrl: string, uploadCache: Map<string, string>) {
    if (uploadCache.has(imageUrl)) {
      return uploadCache.get(imageUrl)!
    }

    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Could not download an image from ${imageUrl} (${imageResponse.status}).`)
    }

    const contentType = imageResponse.headers.get('content-type')
    const blob = await imageResponse.blob()
    const formData = new FormData()
    formData.append('file', blob, inferUploadFileName(imageUrl, contentType))

    const uploadResult = await fetchBoatSearchJson<{ key: string; url: string } | Array<{ key: string; url: string }>>(
      '/api/upload',
      {
        method: 'POST',
        body: formData,
      },
    )
    const uploaded = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult
    if (!uploaded?.url) {
      throw new Error(`Boat Search did not return an image URL for ${imageUrl}.`)
    }

    uploadCache.set(imageUrl, uploaded.url)
    return uploaded.url
  }

  async function storeRecordImagesInR2(
    record: BrowserScrapeRecord,
    uploadCache: Map<string, string>,
  ) {
    if (!record.images.length) {
      return {
        record,
        uploadedCount: 0,
      }
    }

    const nextWarnings = [...record.warnings]
    const nextImages: string[] = []
    let uploadedCount = 0

    for (const imageUrl of record.images.slice(0, 12)) {
      try {
        const uploadedUrl = await uploadImageToBoatSearch(imageUrl, uploadCache)
        nextImages.push(uploadedUrl)
        if (uploadedUrl !== imageUrl) {
          uploadedCount += 1
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : `Could not upload image ${imageUrl}.`
        nextWarnings.push(message)
      }
    }

    return {
      record: {
        ...record,
        images: uniqueStrings(nextImages),
        warnings: uniqueStrings(nextWarnings),
      } satisfies BrowserScrapeRecord,
      uploadedCount,
    }
  }

  async function persistBrowserRecordToBoatSearch(
    run: ExtensionRunStartResponse,
    draft: ScraperPipelineDraft,
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
          record,
        }),
      },
    )
  }

  async function crawlDraftInBrowser(
    draft: ScraperPipelineDraft,
    runState: { recordsPersisted: number; imagesUploaded: number },
    onRecord: (record: BrowserScrapeRecord) => Promise<void>,
  ) {
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
    let crawlTab: chrome.tabs.Tab | null = null

    try {
      crawlTab = await chrome.tabs.create({ url: draft.config.startUrls[0], active: false })
      if (!crawlTab.id) {
        throw new Error('Could not create a background scraper tab.')
      }

      for (const startUrl of draft.config.startUrls) {
        let currentUrl: string | null = startUrl
        let pageIndex = 0

        while (
          currentUrl &&
          pageIndex < draft.config.maxPages &&
          searchRecords.length < draft.config.maxItemsPerRun
        ) {
          if (!isAllowedDomainUrl(currentUrl, allowedDomains)) {
            searchWarnings.push(`Blocked cross-domain page during browser scrape: ${currentUrl}`)
            break
          }

          if (seenSearchUrls.has(currentUrl)) {
            searchWarnings.push(`Stopped pagination loop at ${currentUrl}`)
            break
          }

          browserRunProgress.value = {
            stage: 'search',
            currentUrl,
            pagesVisited,
            itemsSeen,
            itemsExtracted: searchRecords.length,
            detailPagesCompleted: 0,
            detailPagesTotal: 0,
            recordsPersisted: runState.recordsPersisted,
            imagesUploaded: runState.imagesUploaded,
          }
          statusMessage.value = `Scraping search results in the browser: ${currentUrl}`

          const readyTab = await navigateTab(crawlTab.id, currentUrl)
          const pageResult = await sendToTab<SearchPageExtractResponse>(readyTab, {
            type: 'EXTENSION_EXTRACT_SEARCH_PAGE',
            request: { draft },
          })

          seenSearchUrls.add(pageResult.pageUrl)
          visitedUrls.push(pageResult.pageUrl)
          pagesVisited += 1
          pageIndex += 1
          itemsSeen += pageResult.itemCount
          searchWarnings.push(...pageResult.warnings)

          for (const record of pageResult.records) {
            if (searchRecords.length >= draft.config.maxItemsPerRun) {
              break
            }

            searchRecords.push(record)

            if (!draft.config.fetchDetailPages) {
              await onRecord(record)
            }
          }

          currentUrl = pageResult.nextPageUrl
        }
      }

      const detailRecords = draft.config.fetchDetailPages
        ? searchRecords.filter((record) => Boolean(record.url))
        : []

      for (let index = 0; index < detailRecords.length; index += 1) {
        const record = detailRecords[index]
        if (!record) {
          continue
        }

        if (!record.url) {
          await onRecord(record)
          continue
        }

        if (!isAllowedDomainUrl(record.url, allowedDomains)) {
          searchWarnings.push(`Blocked cross-domain detail page during browser scrape: ${record.url}`)
          await onRecord(record)
          continue
        }

        browserRunProgress.value = {
          stage: 'detail',
          currentUrl: record.url,
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          detailPagesCompleted: index,
          detailPagesTotal: detailRecords.length,
          recordsPersisted: runState.recordsPersisted,
          imagesUploaded: runState.imagesUploaded,
        }
        statusMessage.value = `Scraping detail page ${index + 1} of ${detailRecords.length}: ${record.url}`

        try {
          const readyTab = await navigateTab(crawlTab.id, record.url)
          const detailResult = await sendToTab<DetailPageExtractResponse>(readyTab, {
            type: 'EXTENSION_EXTRACT_DETAIL_PAGE',
            request: { draft },
          })

          const recordIndex = searchRecords.findIndex((entry) => entry.url === record.url)
          if (recordIndex >= 0) {
            const mergedRecord = mergeBrowserRecord(searchRecords[recordIndex]!, detailResult.record)
            searchRecords.splice(recordIndex, 1, mergedRecord)
            await onRecord(mergedRecord)
          }

          searchWarnings.push(...detailResult.warnings)
        } catch (error: unknown) {
          searchWarnings.push(
            error instanceof Error
              ? error.message
              : `Could not scrape the detail page for ${record.url}.`,
          )
          await onRecord(record)
        }
      }

      return {
        summary: {
          pagesVisited,
          itemsSeen,
          itemsExtracted: searchRecords.length,
          visitedUrls,
          warnings: uniqueStrings([
            ...searchWarnings,
            ...searchRecords.flatMap((record) => record.warnings),
          ]),
        } satisfies BrowserScrapeSummary,
      }
    } finally {
      if (crawlTab?.id) {
        await chrome.tabs.remove(crawlTab.id).catch(() => {})
      }
    }
  }

  async function handoffToBoatSearch() {
    errorMessage.value = ''
    statusMessage.value = 'Opening Boat Search pipeline builder...'

    try {
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

  async function startScrapeInBoatSearch() {
    errorMessage.value = ''
    startingRemoteRun.value = true
    remoteRun.value = null
    browserRunProgress.value = null
    statusMessage.value = 'Verifying the Boat Search connection...'
    let activeRun: ExtensionRunStartResponse | null = null
    let activeDraft: ScraperPipelineDraft | null = null
    const runState = {
      inserted: 0,
      updated: 0,
      recordsPersisted: 0,
      imagesUploaded: 0,
    }

    try {
      if (!session.value.connection.apiKey.trim()) {
        throw new Error('Add a Boat Search API key before starting a browser scrape.')
      }

      const authStatus = await verifyBoatSearchConnection(true)
      if (!authStatus?.imageUploadEnabled) {
        throw new Error('Boat Search image upload is not enabled yet because no R2 bucket is bound.')
      }

      const draft = structuredClone(session.value.draft)
      activeDraft = draft
      const run = await fetchBoatSearchJson<ExtensionRunStartResponse>(
        '/api/admin/scraper-extension/run/start',
        {
          method: 'POST',
          body: JSON.stringify({ draft }),
        },
      )
      activeRun = run
      const uploadedImageCache = new Map<string, string>()
      statusMessage.value = 'Scraping the site in a real browser tab...'
      const browserRun = await crawlDraftInBrowser(draft, runState, async (record) => {
        const imageResult = await storeRecordImagesInR2(record, uploadedImageCache)
        runState.imagesUploaded += imageResult.uploadedCount
        const persisted = await persistBrowserRecordToBoatSearch(run, draft, imageResult.record)
        runState.inserted += persisted.inserted
        runState.updated += persisted.updated
        runState.recordsPersisted += 1
        browserRunProgress.value = browserRunProgress.value
          ? {
              ...browserRunProgress.value,
              recordsPersisted: runState.recordsPersisted,
              imagesUploaded: runState.imagesUploaded,
            }
          : null
      })
      browserRunProgress.value = {
        stage: 'upload',
        currentUrl: null,
        pagesVisited: browserRun.summary.pagesVisited,
        itemsSeen: browserRun.summary.itemsSeen,
        itemsExtracted: browserRun.summary.itemsExtracted,
        detailPagesCompleted: draft.config.fetchDetailPages ? runState.recordsPersisted : 0,
        detailPagesTotal: draft.config.fetchDetailPages ? browserRun.summary.itemsExtracted : 0,
        recordsPersisted: runState.recordsPersisted,
        imagesUploaded: runState.imagesUploaded,
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
            summary: browserRun.summary,
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
      browserRunProgress.value = null
      statusMessage.value = `Browser scrape complete. Inserted ${response.summary.inserted} and updated ${response.summary.updated} boats.`
      return
    } catch (error: unknown) {
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
    } finally {
      startingRemoteRun.value = false
    }
  }

  function updateConnectionApiKey(value: string) {
    session.value.connection.apiKey = value.trim()
    session.value.connection.verifiedAt = null
    session.value.connection.verifiedEmail = null
    session.value.connection.verifiedName = null
    session.value.connection.imageUploadEnabled = false
  }

  function resetSession() {
    session.value = createDefaultSession()
    statusMessage.value = 'Session reset'
    errorMessage.value = ''
    pendingPicker.value = null
    itemSelectorTraining.value = null
    itemSelectorPreview.value = null
    remoteRun.value = null
    browserRunProgress.value = null
    void clearFieldPreview()
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
        error: preview.matchCount
          ? ''
          : 'No listing cards matched on the current page.',
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
    pendingPicker,
    fieldPreview,
    itemSelectorTraining,
    itemSelectorPreview,
    remoteRun,
    browserRunProgress,
    startingRemoteRun,
    verifyingConnection,
    statusMessage,
    errorMessage,
    loadSession,
    refreshActiveTab,
    analyzeCurrentPage,
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
    updateConnectionApiKey,
    startScrapeInBoatSearch,
    openBoatSearchAccountSettings,
    handoffToBoatSearch,
    resetSession,
  }
}
