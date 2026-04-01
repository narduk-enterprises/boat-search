import { isTrustedPresetId } from '@/shared/sitePresets'
import { hostToSourceName } from '@/shared/transfer'
import { cloneSerializableValue } from '@/sidepanel/utils/cloneSerializableValue'
import type {
  AutoDetectedAnalysis,
  BrowserScrapeRecord,
  ExtensionDebugEvent,
  ExtensionSession,
  SampleDetailRunState,
  SampleDetailRunStatus,
  ScraperFieldRule,
  ScraperFieldScope,
} from '@/shared/types'

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function makeFieldId(field: Pick<ScraperFieldRule, 'key' | 'scope'>) {
  return `${field.scope}:${field.key}`
}

function upsertFieldRule(fields: ScraperFieldRule[], nextField: ScraperFieldRule) {
  const nextId = makeFieldId(nextField)
  const existingIndex = fields.findIndex((field) => makeFieldId(field) === nextId)

  if (existingIndex >= 0) {
    fields.splice(existingIndex, 1, nextField)
    return fields
  }

  fields.push(nextField)
  return fields
}

export function getScopeFields(fields: ScraperFieldRule[], scope: ScraperFieldScope) {
  return fields.filter((field) => field.scope === scope)
}

export function buildAnalysisStatusMessage(analysis: AutoDetectedAnalysis) {
  if (analysis.pageState === 'challenge') {
    return (
      analysis.stateMessage ||
      `Detected a challenge page on ${analysis.siteName}. Open the page in an authorized browser context, then re-scan.`
    )
  }

  if (analysis.pageState === 'no_results') {
    return analysis.stateMessage || `Detected an empty results page on ${analysis.siteName}.`
  }

  if (analysis.pageState === 'parser_changed') {
    return (
      analysis.stateMessage ||
      `The page loaded, but selector detection on ${analysis.siteName} was incomplete.`
    )
  }

  if (analysis.pageType === 'unknown') {
    return 'Page analyzed, but detection was inconclusive.'
  }

  const autoFilled: string[] = []
  if (analysis.pageType === 'search' && analysis.nextPageSelector) {
    autoFilled.push(`next page ${analysis.nextPageSelector}`)
  }
  if (analysis.pageType === 'search' && analysis.sampleDetailUrl) {
    autoFilled.push('sample detail link')
  }
  if (analysis.pageType === 'detail' && analysis.fields.length) {
    autoFilled.push(
      `${analysis.fields.length} detail field suggestion${analysis.fields.length === 1 ? '' : 's'}`,
    )
  }

  return autoFilled.length
    ? `Detected ${analysis.pageType} selectors for ${analysis.siteName}. Auto-filled ${autoFilled.join(' and ')}.`
    : `Detected ${analysis.pageType} selectors for ${analysis.siteName}.`
}

export function applyAnalysisToSession(session: ExtensionSession, analysis: AutoDetectedAnalysis) {
  let host = ''
  try {
    host = new URL(analysis.pageUrl).hostname
  } catch {
    host = ''
  }

  session.currentTabUrl = analysis.pageUrl
  session.lastAnalysis = analysis
  session.sampleDetailUrl = analysis.sampleDetailUrl
  session.draft.boatSource = session.draft.boatSource || hostToSourceName(host || 'unknown')
  session.draft.name =
    session.draft.name || `${hostToSourceName(host || 'unknown')} ${analysis.pageType} pipeline`
  session.draft.config.allowedDomains = uniqueStrings([
    ...session.draft.config.allowedDomains,
    host,
  ])

  if (analysis.pageState === 'ok' && analysis.pageType === 'search') {
    session.stage = 'search'
    session.draft.config.startUrls = [analysis.pageUrl]
    if (analysis.itemSelector) {
      session.draft.config.itemSelector = analysis.itemSelector
    }
    if (analysis.nextPageSelector) {
      session.draft.config.nextPageSelector = analysis.nextPageSelector
    }
  }

  if (analysis.pageState === 'ok' && analysis.pageType === 'detail') {
    session.stage = 'detail'
    session.draft.config.fetchDetailPages = true
  }

  for (const field of analysis.fields) {
    upsertFieldRule(session.draft.config.fields, field)
  }
}

export function buildClearedScrapeSession(
  currentSession: ExtensionSession,
  fallbackSession: ExtensionSession,
) {
  const nextSession = cloneSerializableValue(fallbackSession)

  nextSession.appBaseUrl = currentSession.appBaseUrl
  nextSession.appBaseUrlSource = currentSession.appBaseUrlSource
  nextSession.connection = cloneSerializableValue(currentSession.connection)
  nextSession.browserSettings = cloneSerializableValue(currentSession.browserSettings)
  nextSession.tabTarget = cloneSerializableValue(currentSession.tabTarget)
  nextSession.currentTabUrl = currentSession.currentTabUrl

  return nextSession
}

export function buildSessionWithoutConnection(currentSession: ExtensionSession) {
  const nextSession = cloneSerializableValue(currentSession)

  nextSession.appBaseUrl = ''
  nextSession.appBaseUrlSource = 'manual'
  nextSession.connection = {
    apiKey: '',
    apiKeySource: 'manual',
    verifiedAt: null,
    verifiedEmail: null,
    verifiedName: null,
    imageUploadEnabled: false,
  }

  return nextSession
}

export function isPaginationAutoDetected(session: ExtensionSession) {
  const detectedSelector = session.lastAnalysis?.nextPageSelector?.trim()
  return Boolean(
    session.lastAnalysis?.pageType === 'search' &&
    session.lastAnalysis.pageState === 'ok' &&
    detectedSelector &&
    session.draft.config.nextPageSelector.trim() === detectedSelector,
  )
}

export function shouldContinueBrowserSearchPagination(options: {
  fetchDetailPages: boolean
  searchRecordCount: number
  maxItemsPerRun: number
}) {
  return options.fetchDetailPages || options.searchRecordCount < options.maxItemsPerRun
}

export function collectBrowserDetailQueue(records: BrowserScrapeRecord[]) {
  return records.filter((record) => Boolean(record.url))
}

export function isTrustedPresetReady(session: ExtensionSession) {
  return Boolean(
    isTrustedPresetId(session.preset.appliedPresetId) &&
    session.draft.config.startUrls.length &&
    session.draft.config.fetchDetailPages &&
    getScopeFields(session.draft.config.fields, 'detail').some((field) => field.selector.trim()),
  )
}

export function createSampleDetailRunState(
  status: SampleDetailRunStatus,
  options: {
    url: string | null
    fieldCount?: number
    imageCount?: number
    message: string
  },
): SampleDetailRunState {
  return {
    status,
    url: options.url,
    fieldCount: options.fieldCount ?? 0,
    imageCount: options.imageCount ?? 0,
    message: options.message,
  }
}

export function createDebugEvent(
  type: string,
  message: string,
  detail?: Record<string, unknown>,
): ExtensionDebugEvent {
  return {
    type,
    at: new Date().toISOString(),
    message,
    detail,
  }
}
