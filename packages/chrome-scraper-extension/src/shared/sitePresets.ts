import { createEmptyDraft, createFieldRule } from './defaults'
import type {
  AutoDetectedAnalysis,
  BrowserScrapeRecord,
  ScraperFieldRule,
  ScraperPipelineDraft,
  SitePresetApplicationMode,
  SitePresetId,
  SitePresetPageContext,
} from './types'

export interface SitePresetMatchResult {
  id: SitePresetId
  label: string
  context: SitePresetPageContext
}

type PresetDraftOptions = {
  pageUrl: string
  analysis?: AutoDetectedAnalysis | null
}

type PresetRecordNormalizationOptions = {
  context: SitePresetPageContext
  pageUrl: string
}

interface SitePresetDefinition {
  id: SitePresetId
  label: string
  match: (pageUrl: string) => SitePresetPageContext | null
  buildDraft: (options: PresetDraftOptions) => ScraperPipelineDraft
  normalizeRecord?: (
    record: BrowserScrapeRecord,
    options: PresetRecordNormalizationOptions,
  ) => BrowserScrapeRecord
}

const YACHTWORLD_LABEL = 'YachtWorld Search'
const YACHTWORLD_ALLOWED_DOMAINS = ['www.yachtworld.com', 'images.yachtworld.com']
const EMPTY_DRAFT_FINGERPRINT = JSON.stringify(createEmptyDraft())

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function buildFieldId(field: Pick<ScraperFieldRule, 'key' | 'scope'>) {
  return `${field.scope}:${field.key}`
}

function mergeFieldRules(...fieldGroups: ScraperFieldRule[][]) {
  const merged = new Map<string, ScraperFieldRule>()

  for (const group of fieldGroups) {
    for (const field of group) {
      merged.set(buildFieldId(field), field)
    }
  }

  return [...merged.values()]
}

function normalizeTitle(value: string | null | undefined) {
  return (value || '').replaceAll(/\s+/g, ' ').trim()
}

function splitYachtWorldTitle(title: string | null | undefined) {
  const normalized = normalizeTitle(title)
  if (!normalized) {
    return {
      year: null,
      make: null,
      model: null,
    }
  }

  const yearMatch = normalized.match(/^(19|20)\d{2}\b/)
  const withoutYear = yearMatch ? normalized.slice(yearMatch[0].length).trim() : normalized
  const [make = '', ...modelParts] = withoutYear.split(/\s+/)

  return {
    year: yearMatch?.[0] || null,
    make: make || null,
    model: modelParts.join(' ').trim() || null,
  }
}

function splitLocationParts(location: string | null | undefined) {
  const normalized = normalizeTitle(location)
  if (!normalized) {
    return {
      city: null,
      state: null,
      country: null,
    }
  }

  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return {
      city: null,
      state: null,
      country: null,
    }
  }

  if (parts.length === 1) {
    return {
      city: parts[0] || null,
      state: null,
      country: null,
    }
  }

  if (parts.length === 2) {
    const [city, second] = parts
    const normalizedSecond = second.toLowerCase()
    if (/^(united states|usa|u\.s\.a\.|canada|mexico|bahamas)$/i.test(normalizedSecond)) {
      return {
        city: city || null,
        state: null,
        country: second || null,
      }
    }

    return {
      city: city || null,
      state: second || null,
      country: null,
    }
  }

  return {
    city: parts[0] || null,
    state: parts[1] || null,
    country: parts.slice(2).join(', ') || null,
  }
}

function extractListingIdFromUrl(url: string | null | undefined) {
  return normalizeTitle(url).match(/-(\d{6,})(?:\/|$)/)?.[1] || null
}

function extractCurrencyFromText(value: string | null | undefined) {
  const normalized = normalizeTitle(value)
  if (!normalized) {
    return null
  }

  if (normalized.includes('$') || /\bUSD\b/i.test(normalized)) return 'USD'
  if (normalized.includes('€') || /\bEUR\b/i.test(normalized)) return 'EUR'
  if (normalized.includes('£') || /\bGBP\b/i.test(normalized)) return 'GBP'
  if (normalized.includes('C$') || /\bCAD\b/i.test(normalized)) return 'CAD'

  return null
}

function extractLengthFromText(value: string | null | undefined) {
  const normalized = normalizeTitle(value)
  if (!normalized) {
    return null
  }

  return (
    normalized.match(/\b\d{2,3}(?:\.\d+)?\s*(?:ft|feet|foot)\b/i)?.[0] ||
    normalized.match(/\b\d{2,3}'(?:\s*\d+")?/i)?.[0] ||
    null
  )
}

function inferSellerType(value: string | null | undefined) {
  const normalized = normalizeTitle(value).toLowerCase()
  if (!normalized) {
    return null
  }

  if (/\bprivate seller\b/.test(normalized)) return 'private-seller'
  if (/\bbroker(?:ed)?\b/.test(normalized)) return 'broker'
  if (/\bdealer\b/.test(normalized)) return 'dealer'

  return null
}

function normalizeListingType(value: string | null | undefined) {
  const normalized = normalizeTitle(value).toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized.includes('used')) return 'used'
  if (normalized.includes('new')) return 'new'
  if (normalized.includes('sale')) return 'sale'

  return normalized
}

function createYachtWorldPipelineName(pageUrl: string) {
  try {
    const { pathname } = new URL(pageUrl)
    const segments = pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter(
        (segment) =>
          !/^boats-for-sale$/i.test(segment) &&
          !/^placeid-/i.test(segment) &&
          !/^radius-/i.test(segment) &&
          !/^price-/i.test(segment) &&
          !/^page-\d+$/i.test(segment),
      )

    if (!segments.length) {
      return 'YachtWorld Search Pipeline'
    }

    const label = segments
      .slice(0, 3)
      .join(' ')
      .replaceAll(/[-_]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase())

    return `YachtWorld ${label} Pipeline`
  } catch {
    return 'YachtWorld Search Pipeline'
  }
}

function getYachtWorldSearchFields(analysis?: AutoDetectedAnalysis | null) {
  const inferredFields = analysis?.pageType === 'search' && analysis.pageState === 'ok'
    ? analysis.fields.filter((field) => field.scope === 'item')
    : []

  const staticFields = [
    createFieldRule('url', 'item', 'a[href*="/yacht/"]', {
      extract: 'attr',
      attribute: 'href',
      transform: 'url',
    }),
    createFieldRule('listingId', 'item', 'a[href*="/yacht/"]', {
      extract: 'attr',
      attribute: 'href',
      regex: '-(\\d{6,})(?:/|$)',
      required: false,
    }),
    createFieldRule('title', 'item', 'a[href*="/yacht/"]'),
    createFieldRule('year', 'item', 'a[href*="/yacht/"]', {
      regex: '^((?:19|20)\\d{2})\\b',
      transform: 'year',
      required: false,
    }),
    createFieldRule('make', 'item', 'a[href*="/yacht/"]', {
      regex: '^(?:19|20)\\d{2}\\s+([A-Za-z0-9&./\'-]+)',
      required: false,
    }),
    createFieldRule('model', 'item', 'a[href*="/yacht/"]', {
      regex: '^(?:19|20)\\d{2}\\s+[A-Za-z0-9&./\'-]+\\s+(.+)$',
      required: false,
    }),
    createFieldRule('price', 'item', '.listing-price, [class*="price" i], [data-testid*="price" i]', {
      transform: 'price',
      required: false,
    }),
    createFieldRule('currency', 'item', '.listing-price, [class*="price" i], [data-testid*="price" i]', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'item', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      required: false,
    }),
    createFieldRule('city', 'item', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'item', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'item', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('images', 'item', 'img', {
      extract: 'attr',
      attribute: 'src',
      multiple: true,
      transform: 'url',
      required: false,
    }),
  ]

  return mergeFieldRules(staticFields, inferredFields)
}

function getYachtWorldDetailFields() {
  return [
    createFieldRule('url', 'detail', ':root', {
      regex: '(https?://[^\\s]+)',
      required: false,
    }),
    createFieldRule('listingId', 'detail', ':root', {
      regex: '-(\\d{6,})(?:/|$)',
      required: false,
    }),
    createFieldRule('title', 'detail', 'h1'),
    createFieldRule('year', 'detail', 'h1', {
      regex: '^((?:19|20)\\d{2})\\b',
      transform: 'year',
      required: false,
    }),
    createFieldRule('make', 'detail', 'h1', {
      regex: '^(?:19|20)\\d{2}\\s+([A-Za-z0-9&./\'-]+)',
      required: false,
    }),
    createFieldRule('model', 'detail', 'h1', {
      regex: '^(?:19|20)\\d{2}\\s+[A-Za-z0-9&./\'-]+\\s+(.+)$',
      required: false,
    }),
    createFieldRule('length', 'detail', ':root', {
      regex: '(\\b\\d{2,3}(?:\\.\\d+)?\\s*(?:ft|feet|foot)\\b|\\b\\d{2,3}\'(?:\\s*\\d+")?)',
      required: false,
    }),
    createFieldRule('price', 'detail', '.listing-price, [class*="price" i], [data-testid*="price" i]', {
      transform: 'price',
      required: false,
    }),
    createFieldRule('currency', 'detail', '.listing-price, [class*="price" i], [data-testid*="price" i]', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'detail', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      required: false,
    }),
    createFieldRule('city', 'detail', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'detail', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'detail', '.listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('description', 'detail', '.description-panel, [class*="description" i], main', {
      required: false,
    }),
    createFieldRule('sellerType', 'detail', ':root', {
      regex: '(private seller|broker(?:ed)?|dealer)',
      required: false,
    }),
    createFieldRule('listingType', 'detail', ':root', {
      regex: '\\b(new|used)\\b',
      required: false,
    }),
    createFieldRule('images', 'detail', '[data-testid="listing-gallery"] img, .photo-gallery img, .gallery-rail img', {
      extract: 'attr',
      attribute: 'src',
      transform: 'url',
      multiple: true,
      required: false,
    }),
    createFieldRule('fullText', 'detail', 'main', {
      required: false,
    }),
  ]
}

function buildYachtWorldDraft({ pageUrl, analysis }: PresetDraftOptions) {
  const draft = createEmptyDraft()
  const currentHost = (() => {
    try {
      return new URL(pageUrl).hostname
    } catch {
      return ''
    }
  })()

  draft.name = createYachtWorldPipelineName(pageUrl)
  draft.boatSource = 'YachtWorld'
  draft.description =
    'Trusted YachtWorld preset. Search selectors, detail fields, and pagination rules were auto-loaded in the extension.'
  draft.config.startUrls = [pageUrl]
  draft.config.allowedDomains = uniqueStrings([...YACHTWORLD_ALLOWED_DOMAINS, currentHost])
  draft.config.itemSelector =
    analysis?.pageType === 'search' && analysis.pageState === 'ok' && analysis.itemSelector
      ? analysis.itemSelector
      : 'article'
  draft.config.nextPageSelector =
    analysis?.pageType === 'search' && analysis.pageState === 'ok' && analysis.nextPageSelector
      ? analysis.nextPageSelector
      : 'a[rel="next"]'
  draft.config.fetchDetailPages = true
  draft.config.fields = [
    ...getYachtWorldSearchFields(analysis),
    ...getYachtWorldDetailFields(),
  ]

  return draft
}

function normalizeYachtWorldRecord(
  record: BrowserScrapeRecord,
  { context, pageUrl }: PresetRecordNormalizationOptions,
) {
  const nextRecord: BrowserScrapeRecord = {
    ...record,
    rawFields: {
      ...record.rawFields,
    },
    images: uniqueStrings(record.images),
    warnings: uniqueStrings(record.warnings),
  }

  const titleParts = splitYachtWorldTitle(nextRecord.title)
  const locationParts = splitLocationParts(nextRecord.location)
  const fullText = normalizeTitle(
    (typeof nextRecord.rawFields.fullText === 'string' ? nextRecord.rawFields.fullText : '') ||
      nextRecord.fullText ||
      nextRecord.description,
  )

  if (!nextRecord.url && context === 'detail') {
    nextRecord.url = pageUrl
  }

  if (!nextRecord.listingId) {
    nextRecord.listingId = extractListingIdFromUrl(nextRecord.url || pageUrl)
  }

  if (!nextRecord.year && titleParts.year) {
    nextRecord.year = Number.parseInt(titleParts.year, 10) || null
  }

  if (!nextRecord.make && titleParts.make) {
    nextRecord.make = titleParts.make
  }

  if (!nextRecord.model && titleParts.model) {
    nextRecord.model = titleParts.model
  }

  if (!nextRecord.city && locationParts.city) {
    nextRecord.city = locationParts.city
  }

  if (!nextRecord.state && locationParts.state) {
    nextRecord.state = locationParts.state
  }

  if (!nextRecord.country && locationParts.country) {
    nextRecord.country = locationParts.country
  }

  if (!nextRecord.currency) {
    nextRecord.currency = null
  }
  nextRecord.currency =
    extractCurrencyFromText(nextRecord.currency) ||
    extractCurrencyFromText(typeof nextRecord.rawFields.currency === 'string' ? nextRecord.rawFields.currency : '') ||
    extractCurrencyFromText(fullText) ||
    nextRecord.currency ||
    'USD'

  if (!nextRecord.length) {
    nextRecord.length = extractLengthFromText(fullText)
  }

  nextRecord.sellerType = inferSellerType(nextRecord.sellerType || fullText) || nextRecord.sellerType
  nextRecord.listingType = normalizeListingType(nextRecord.listingType || fullText) || 'sale'

  if (!nextRecord.fullText && fullText) {
    nextRecord.fullText = fullText
  }

  return nextRecord
}

const SITE_PRESETS: SitePresetDefinition[] = [
  {
    id: 'yachtworld-search',
    label: YACHTWORLD_LABEL,
    match(pageUrl) {
      try {
        const url = new URL(pageUrl)
        if (url.hostname !== 'www.yachtworld.com') {
          return null
        }

        if (/\/boats-for-sale\//i.test(url.pathname)) {
          return 'search'
        }

        if (/\/yacht\//i.test(url.pathname)) {
          return 'detail'
        }

        return null
      } catch {
        return null
      }
    },
    buildDraft: buildYachtWorldDraft,
    normalizeRecord: normalizeYachtWorldRecord,
  },
]

export function getSitePresetById(id: SitePresetId) {
  return SITE_PRESETS.find((preset) => preset.id === id) || null
}

export function getSitePresetLabel(id: SitePresetId | null | undefined) {
  if (!id) {
    return null
  }

  return getSitePresetById(id)?.label || null
}

export function findMatchingSitePreset(pageUrl: string) {
  for (const preset of SITE_PRESETS) {
    const context = preset.match(pageUrl)
    if (context) {
      return {
        id: preset.id,
        label: preset.label,
        context,
      } satisfies SitePresetMatchResult
    }
  }

  return null
}

export function buildPresetDraft(
  presetId: SitePresetId,
  options: PresetDraftOptions,
) {
  const preset = getSitePresetById(presetId)
  if (!preset) {
    return createEmptyDraft()
  }

  return preset.buildDraft(options)
}

export function normalizePresetRecord(
  presetId: SitePresetId | null | undefined,
  record: BrowserScrapeRecord,
  options: PresetRecordNormalizationOptions,
) {
  if (!presetId) {
    return record
  }

  const preset = getSitePresetById(presetId)
  if (!preset?.normalizeRecord) {
    return record
  }

  return preset.normalizeRecord(record, options)
}

export function buildPresetDraftFingerprint(draft: ScraperPipelineDraft) {
  return JSON.stringify(draft)
}

export function isDefaultDraft(draft: ScraperPipelineDraft) {
  return buildPresetDraftFingerprint(draft) === EMPTY_DRAFT_FINGERPRINT
}

export function canAutoApplySitePreset(options: {
  draft: ScraperPipelineDraft
  appliedPresetId: SitePresetId | null
  isDraftDirty: boolean
  match: SitePresetMatchResult | null
}) {
  if (!options.match || options.match.context !== 'search') {
    return false
  }

  if (isDefaultDraft(options.draft)) {
    return true
  }

  return options.appliedPresetId === options.match.id && !options.isDraftDirty
}

export function isTrustedPresetId(presetId: SitePresetId | null | undefined) {
  return Boolean(presetId && getSitePresetById(presetId))
}

export function describePresetApplication(mode: SitePresetApplicationMode) {
  return mode === 'auto' ? 'auto-loaded' : 'loaded'
}
