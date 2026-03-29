import { hostToSourceName } from './transfer'
import type {
  AnalysisPageState,
  AutoDetectedAnalysis,
  FixtureCaptureMetadata,
  FixtureCaptureRecord,
  FixtureCaptureSessionState,
  FixtureCaptureSummary,
  FixtureCaptureTemplate,
  PageType,
} from './types'

export const FIXTURE_CAPTURE_TEMPLATES = [
  'search-ok',
  'search-no-results',
  'detail-ok',
  'detail-gallery-noise',
  'custom',
] as const satisfies readonly FixtureCaptureTemplate[]

export const FIXTURE_CAPTURE_GUIDED_TEMPLATES = FIXTURE_CAPTURE_TEMPLATES.filter(
  (template) => template !== 'custom',
)

export type FixtureCaptureMatchStatus = 'match' | 'mismatch' | 'unknown'

export type FixtureCaptureTemplateDefinition = {
  id: FixtureCaptureTemplate
  label: string
  description: string
  expectedShape: string
}

const FIXTURE_CAPTURE_TEMPLATE_DEFINITIONS: Record<
  FixtureCaptureTemplate,
  FixtureCaptureTemplateDefinition
> = {
  'search-ok': {
    id: 'search-ok',
    label: 'Search OK',
    description: 'A stable results page with listing cards visible.',
    expectedShape: 'Expected: search page in an ok state.',
  },
  'search-no-results': {
    id: 'search-no-results',
    label: 'Search No Results',
    description: 'An empty results page that still shows the marketplace shell.',
    expectedShape: 'Expected: search page in a no-results state.',
  },
  'detail-ok': {
    id: 'detail-ok',
    label: 'Detail OK',
    description: 'A representative listing detail page with the normal content layout.',
    expectedShape: 'Expected: detail page in an ok state.',
  },
  'detail-gallery-noise': {
    id: 'detail-gallery-noise',
    label: 'Detail Gallery Noise',
    description: 'A detail page with gallery chrome, duplicate media, or noisy image modules.',
    expectedShape: 'Expected: detail page with at least one detected gallery image.',
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    description: 'Capture any page state under a custom fixture label.',
    expectedShape: 'Expected: any page you want to preserve as a fixture.',
  },
}

function createFixtureCaptureRecord(template: FixtureCaptureTemplate): FixtureCaptureRecord {
  return {
    template,
    fileStem: null,
    files: [],
    currentUrl: null,
    pageType: null,
    pageState: null,
    capturedAt: null,
  }
}

export function createDefaultFixtureCaptureSessionState(): FixtureCaptureSessionState {
  return {
    selectedTemplate: 'search-ok',
    customLabel: '',
    captured: {
      'search-ok': createFixtureCaptureRecord('search-ok'),
      'search-no-results': createFixtureCaptureRecord('search-no-results'),
      'detail-ok': createFixtureCaptureRecord('detail-ok'),
      'detail-gallery-noise': createFixtureCaptureRecord('detail-gallery-noise'),
      custom: createFixtureCaptureRecord('custom'),
    },
    lastCapture: null,
  }
}

export function getFixtureCaptureTemplateDefinition(template: FixtureCaptureTemplate) {
  return FIXTURE_CAPTURE_TEMPLATE_DEFINITIONS[template]
}

export function listFixtureCaptureTemplateDefinitions() {
  return FIXTURE_CAPTURE_TEMPLATES.map((template) =>
    getFixtureCaptureTemplateDefinition(template),
  )
}

export function normalizeFixtureCaptureTemplate(value: unknown): FixtureCaptureTemplate {
  return typeof value === 'string' &&
    FIXTURE_CAPTURE_TEMPLATES.includes(value as FixtureCaptureTemplate)
    ? (value as FixtureCaptureTemplate)
    : 'search-ok'
}

export function slugifyFixtureSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function resolveFixtureLabel(template: FixtureCaptureTemplate, customLabel: string) {
  if (template !== 'custom') {
    return template
  }

  return slugifyFixtureSegment(customLabel) || 'custom'
}

export function buildFixtureCaptureFileStem(hostname: string, fixtureLabel: string) {
  const host = slugifyFixtureSegment(hostToSourceName(hostname || 'unknown')) || 'unknown'
  const label = slugifyFixtureSegment(fixtureLabel) || 'capture'
  return `${host}--${label}`
}

export function buildFixtureCaptureFileNames(fileStem: string) {
  return [`${fileStem}.html`, `${fileStem}.png`, `${fileStem}.meta.json`]
}

function normalizeRecordShape(
  value: unknown,
  fallback: FixtureCaptureRecord,
): FixtureCaptureRecord {
  if (!value || typeof value !== 'object') {
    return { ...fallback }
  }

  const raw = value as Partial<FixtureCaptureRecord>
  const pageType = normalizePageType(raw.pageType)
  const pageState = normalizePageState(raw.pageState)

  return {
    ...fallback,
    ...raw,
    template: fallback.template,
    fileStem: typeof raw.fileStem === 'string' ? raw.fileStem : null,
    files: Array.isArray(raw.files)
      ? raw.files.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    currentUrl: typeof raw.currentUrl === 'string' ? raw.currentUrl : null,
    pageType,
    pageState,
    capturedAt: typeof raw.capturedAt === 'string' ? raw.capturedAt : null,
  }
}

function normalizePageType(value: unknown): PageType | null {
  return value === 'search' || value === 'detail' || value === 'unknown' ? value : null
}

function normalizePageState(value: unknown): AnalysisPageState | null {
  return value === 'ok' ||
    value === 'challenge' ||
    value === 'no_results' ||
    value === 'parser_changed'
    ? value
    : null
}

export function normalizeFixtureCaptureSessionState(
  value: unknown,
  fallback = createDefaultFixtureCaptureSessionState(),
): FixtureCaptureSessionState {
  if (!value || typeof value !== 'object') {
    return structuredClone(fallback)
  }

  const raw = value as Partial<FixtureCaptureSessionState>
  const rawCaptured = raw.captured && typeof raw.captured === 'object' ? raw.captured : {}
  const selectedTemplate = normalizeFixtureCaptureTemplate(raw.selectedTemplate)

  return {
    selectedTemplate,
    customLabel: typeof raw.customLabel === 'string' ? raw.customLabel : fallback.customLabel,
    captured: {
      'search-ok': normalizeRecordShape(
        (rawCaptured as Partial<Record<FixtureCaptureTemplate, FixtureCaptureRecord>>)['search-ok'],
        fallback.captured['search-ok'],
      ),
      'search-no-results': normalizeRecordShape(
        (rawCaptured as Partial<Record<FixtureCaptureTemplate, FixtureCaptureRecord>>)['search-no-results'],
        fallback.captured['search-no-results'],
      ),
      'detail-ok': normalizeRecordShape(
        (rawCaptured as Partial<Record<FixtureCaptureTemplate, FixtureCaptureRecord>>)['detail-ok'],
        fallback.captured['detail-ok'],
      ),
      'detail-gallery-noise': normalizeRecordShape(
        (rawCaptured as Partial<Record<FixtureCaptureTemplate, FixtureCaptureRecord>>)['detail-gallery-noise'],
        fallback.captured['detail-gallery-noise'],
      ),
      custom: normalizeRecordShape(
        (rawCaptured as Partial<Record<FixtureCaptureTemplate, FixtureCaptureRecord>>).custom,
        fallback.captured.custom,
      ),
    },
    lastCapture: normalizeFixtureCaptureSummary(raw.lastCapture),
  }
}

function normalizeFixtureCaptureSummary(value: unknown): FixtureCaptureSummary | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Partial<FixtureCaptureSummary>
  const template = normalizeFixtureCaptureTemplate(raw.template)
  const pageType = normalizePageType(raw.pageType)
  const pageState = normalizePageState(raw.pageState)

  if (
    typeof raw.fileStem !== 'string' ||
    !raw.fileStem.trim() ||
    typeof raw.currentUrl !== 'string' ||
    !raw.currentUrl.trim() ||
    typeof raw.capturedAt !== 'string' ||
    !raw.capturedAt.trim() ||
    !pageType ||
    !pageState
  ) {
    return null
  }

  return {
    template,
    fileStem: raw.fileStem,
    files: Array.isArray(raw.files)
      ? raw.files.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    currentUrl: raw.currentUrl,
    pageType,
    pageState,
    capturedAt: raw.capturedAt,
  }
}

export function buildFixtureCaptureMetadata(options: {
  capturedAt: string
  host: string
  fixtureLabel: string
  currentUrl: string
  title: string
  analysis: AutoDetectedAnalysis
  matchedPresetId: FixtureCaptureMetadata['matchedPresetId']
  matchedPresetLabel: string | null
  appliedPresetId: FixtureCaptureMetadata['appliedPresetId']
  appliedPresetLabel: string | null
  viewport: FixtureCaptureMetadata['viewport']
}): FixtureCaptureMetadata {
  return {
    capturedAt: options.capturedAt,
    host: hostToSourceName(options.host),
    fixtureLabel: options.fixtureLabel,
    currentUrl: options.currentUrl,
    title: options.title,
    pageType: options.analysis.pageType,
    pageState: options.analysis.pageState,
    analysisWarnings: uniqueStrings([
      options.analysis.stateMessage || '',
      ...options.analysis.warnings,
    ]),
    stats: {
      ...options.analysis.stats,
    },
    matchedPresetId: options.matchedPresetId,
    matchedPresetLabel: options.matchedPresetLabel,
    appliedPresetId: options.appliedPresetId,
    appliedPresetLabel: options.appliedPresetLabel,
    viewport: {
      ...options.viewport,
    },
  }
}

export function evaluateFixtureCaptureTemplate(
  template: FixtureCaptureTemplate,
  analysis: AutoDetectedAnalysis | null,
  currentTabUrl: string | null,
): {
  status: FixtureCaptureMatchStatus
  note: string
} {
  if (!currentTabUrl) {
    return {
      status: 'unknown',
      note: 'Open a normal web page, then re-scan if you want a live match preview.',
    }
  }

  if (!analysis || analysis.pageUrl !== currentTabUrl) {
    return {
      status: 'unknown',
      note: 'Re-scan this page to preview whether it matches the selected fixture type.',
    }
  }

  if (template === 'custom') {
    return {
      status: 'match',
      note: 'Custom captures can save any current page state.',
    }
  }

  if (template === 'search-ok') {
    return analysis.pageType === 'search' && analysis.pageState === 'ok'
      ? { status: 'match', note: 'Search page is classified as a stable results page.' }
      : {
          status: 'mismatch',
          note: 'Expected a search page in an ok state before saving this fixture.',
        }
  }

  if (template === 'search-no-results') {
    return analysis.pageType === 'search' && analysis.pageState === 'no_results'
      ? { status: 'match', note: 'Search page is classified as a no-results page.' }
      : {
          status: 'mismatch',
          note: 'Expected a search page in a no-results state before saving this fixture.',
        }
  }

  if (template === 'detail-ok') {
    return analysis.pageType === 'detail' && analysis.pageState === 'ok'
      ? { status: 'match', note: 'Detail page is classified as stable.' }
      : {
          status: 'mismatch',
          note: 'Expected a detail page in an ok state before saving this fixture.',
        }
  }

  return analysis.pageType === 'detail' &&
    analysis.pageState === 'ok' &&
    analysis.stats.distinctImageCount > 0
    ? {
        status: 'match',
        note: 'Detail page has gallery images and is a good candidate for noisy media capture.',
      }
    : {
        status: 'mismatch',
        note: 'Expected a detail page with detected gallery images before saving this fixture.',
      }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
