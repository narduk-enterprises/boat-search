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

function normalizeYachtWorldTitleText(title: string | null | undefined) {
  const normalized = normalizeTitle(title)
  if (!normalized) {
    return ''
  }

  const withoutBadges = normalized.replace(
    /^(?:(?:featured|price drop|new arrival|reduced|sale pending)\s*)+/i,
    '',
  )
  const firstYearIndex = withoutBadges.search(/\b(?:19|20)\d{2}\b/)
  const alignedToYear =
    firstYearIndex >= 0 ? withoutBadges.slice(firstYearIndex).trim() : withoutBadges
  const cutoffIndex = alignedToYear.search(
    /(?:US|C|CA)?\$\s*[\d,.]+|€\s*[\d,.]+|£\s*[\d,.]+|\brequest price\b/i,
  )

  return (cutoffIndex > 0 ? alignedToYear.slice(0, cutoffIndex) : alignedToYear).trim()
}

function splitYachtWorldTitle(title: string | null | undefined) {
  const normalized = normalizeYachtWorldTitleText(title).replace(
    /\s*\|\s*\d{2,3}(?:\.\d+)?\s*ft\b/i,
    '',
  )
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

function normalizeYachtWorldLocationText(value: string | null | undefined) {
  const normalized = normalizeTitle(value)
  if (!normalized) {
    return null
  }

  const trailingLocation =
    normalized.match(/([A-Za-z .'-]+,\s*[A-Za-z .'-]+(?:,\s*[A-Za-z .'-]+)?)$/)?.[1] || null
  if (trailingLocation) {
    return trailingLocation.trim()
  }

  if (normalized.includes('|')) {
    const tail = normalized.split('|').at(-1)?.trim()
    if (tail) {
      return tail
    }
  }

  return normalized
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

function isGenericYachtWorldDescription(value: string | null | undefined) {
  const normalized = normalizeTitle(value).toLowerCase()
  return (
    normalized.includes('find more information and images about the boat') &&
    normalized.includes('contact the seller')
  )
}

function normalizeImageIdentity(url: string) {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}

function isYachtWorldBoatImageUrl(url: string, listingId: string | null | undefined) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname.toLowerCase()

    if (!/^https?:$/i.test(parsed.protocol)) {
      return false
    }

    if (hostname === 'img.youtube.com') {
      return false
    }

    if (
      hostname !== 'images.yachtworld.com' &&
      !hostname.endsWith('boatsgroup.com') &&
      hostname !== 'imt.boatwizard.com'
    ) {
      return false
    }

    if (
      pathname.includes('/upload/') ||
      pathname.includes('/profiles/') ||
      /(?:^|\/)(?:sprite|icon|logo|avatar|placeholder|blank|tracking|pixel|spinner)/i.test(pathname)
    ) {
      return false
    }

    if (listingId && hostname.endsWith('boatsgroup.com') && !pathname.includes(`-${listingId}-`)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function normalizeYachtWorldImages(images: string[], listingId: string | null | undefined) {
  const deduped = new Map<string, string>()

  for (const image of images) {
    if (!isYachtWorldBoatImageUrl(image, listingId)) {
      continue
    }

    const identity = normalizeImageIdentity(image)
    if (!deduped.has(identity)) {
      deduped.set(identity, image)
    }
  }

  return [...deduped.values()]
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
    createFieldRule('url', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]', {
      extract: 'attr',
      attribute: 'href',
      transform: 'url',
    }),
    createFieldRule('listingId', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]', {
      extract: 'attr',
      attribute: 'href',
      regex: '-(\\d{6,})(?:/|$)',
      required: false,
    }),
    createFieldRule('title', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]'),
    createFieldRule('year', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]', {
      regex: '^((?:19|20)\\d{2})\\b',
      transform: 'year',
      required: false,
    }),
    createFieldRule('make', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]', {
      regex: '^(?:19|20)\\d{2}\\s+([A-Za-z0-9&./\'-]+)',
      required: false,
    }),
    createFieldRule('model', 'item', 'a.grid-listing-link[href*="/yacht/"], a[href*="/yacht/"]', {
      regex: '^(?:19|20)\\d{2}\\s+[A-Za-z0-9&./\'-]+\\s+(.+?)(?:\\s*\\|\\s*\\d{2,3}(?:\\.\\d+)?\\s*ft)?$',
      required: false,
    }),
    createFieldRule('price', 'item', 'span.style-module_listingPrice__lsbyO > p.style-module_content__tmQCh, .listing-price, [class*="price" i], [data-testid*="price" i]', {
      transform: 'price',
      regex: '((?:US|C|CA)?\\$\\s*[\\d,.]+|€\\s*[\\d,.]+|£\\s*[\\d,.]+)',
      required: false,
    }),
    createFieldRule('currency', 'item', 'span.style-module_listingPrice__lsbyO > p.style-module_content__tmQCh, .listing-price, [class*="price" i], [data-testid*="price" i]', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'item', 'span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh.style-module_content-3__kZFb1, span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh, .listing-location, [class*="location" i], [data-testid*="location" i]', {
      required: false,
    }),
    createFieldRule('city', 'item', 'span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh.style-module_content-3__kZFb1, span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh, .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'item', 'span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh.style-module_content-3__kZFb1, span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh, .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'item', 'span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh.style-module_content-3__kZFb1, span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh, .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('images', 'item', 'div.style-module_wrapper__3JAO6 > span.style-module_image__tb1LM > img, img', {
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
    createFieldRule('listingId', 'detail', ':root', {
      regex: '-(\\d{6,})(?:/|$)',
      required: false,
    }),
    createFieldRule('title', 'detail', 'div#bdp-boat-summary h1, h1'),
    createFieldRule('year', 'detail', 'div#bdp-boat-summary h1, h1', {
      regex: '^((?:19|20)\\d{2})\\b',
      transform: 'year',
      required: false,
    }),
    createFieldRule('make', 'detail', 'div#bdp-boat-summary h1, h1', {
      regex: '^(?:19|20)\\d{2}\\s+([A-Za-z0-9&./\'-]+)',
      required: false,
    }),
    createFieldRule('model', 'detail', 'div#bdp-boat-summary h1, h1', {
      regex: '^(?:19|20)\\d{2}\\s+[A-Za-z0-9&./\'-]+\\s+(.+?)(?:\\s*\\|\\s*\\d{2,3}(?:\\.\\d+)?\\s*ft)?$',
      required: false,
    }),
    createFieldRule('length', 'detail', 'div#bdp-boat-summary h1, :root', {
      regex: '(\\b\\d{2,3}(?:\\.\\d+)?\\s*(?:ft|feet|foot)\\b|\\b\\d{2,3}\'(?:\\s*\\d+")?)',
      required: false,
    }),
    createFieldRule('price', 'detail', 'div.next-previous-listing-price, div#bdp-boat-summary [class*="listingPrice" i] > p, div#bdp-boat-summary [class*="price" i] > p, .listing-price, [class*="price" i], [data-testid*="price" i]', {
      transform: 'price',
      regex: '((?:US|C|CA)?\\$\\s*[\\d,.]+|€\\s*[\\d,.]+|£\\s*[\\d,.]+)',
      required: false,
    }),
    createFieldRule('currency', 'detail', 'div.next-previous-listing-price, div#bdp-boat-summary [class*="listingPrice" i] > p, div#bdp-boat-summary [class*="price" i] > p, .listing-price, [class*="price" i], [data-testid*="price" i]', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'detail', 'div.next-previous-listing-location, div#bdp-boat-summary [class*="location" i], .listing-location, [class*="location" i], [data-testid*="location" i]', {
      required: false,
    }),
    createFieldRule('city', 'detail', 'div.next-previous-listing-location, div#bdp-boat-summary [class*="location" i], .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'detail', 'div.next-previous-listing-location, div#bdp-boat-summary [class*="location" i], .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'detail', 'div.next-previous-listing-location, div#bdp-boat-summary [class*="location" i], .listing-location, [class*="location" i], [data-testid*="location" i]', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('description', 'detail', 'div.accordion-details-items details > div.data-html > div.data-html-inner-wrapper > div.render-html, div.data-html-inner-wrapper > div.render-html, .description-panel, [class*="description" i]', {
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
    createFieldRule('images', 'detail', 'div.style-module_mediaCarousel__gADiR div.embla__slide img, [data-testid="listing-gallery"] img, .photo-gallery img, .gallery-rail img', {
      extract: 'attr',
      attribute: 'src',
      transform: 'url',
      multiple: true,
      required: false,
    }),
    createFieldRule('fullText', 'detail', 'div.accordion-details-wrapper, div.data-html-inner-wrapper > div.render-html, main', {
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
      : 'div.grid-item'
  draft.config.nextPageSelector =
    analysis?.pageType === 'search' && analysis.pageState === 'ok' && analysis.nextPageSelector
      ? analysis.nextPageSelector
      : 'a.next, a[rel="next"], a[aria-label*="next" i]'
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

  nextRecord.title = normalizeYachtWorldTitleText(nextRecord.title) || nextRecord.title
  nextRecord.location = normalizeYachtWorldLocationText(nextRecord.location) || nextRecord.location

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

  if (titleParts.make) {
    nextRecord.make = titleParts.make
  }

  if (titleParts.model) {
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
    nextRecord.length = extractLengthFromText(nextRecord.title || fullText)
  }

  if (isGenericYachtWorldDescription(nextRecord.description)) {
    nextRecord.description = null
  }

  nextRecord.images = normalizeYachtWorldImages(nextRecord.images, nextRecord.listingId)
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

export function buildRuntimePresetDraft(
  draft: ScraperPipelineDraft,
  presetId: SitePresetId,
  pageUrl: string,
) {
  const presetDraft = buildPresetDraft(presetId, {
    pageUrl,
    analysis: null,
  })

  return {
    ...draft,
    boatSource: draft.boatSource || presetDraft.boatSource,
    name: draft.name || presetDraft.name,
    description: draft.description || presetDraft.description,
    config: {
      ...draft.config,
      allowedDomains: uniqueStrings([
        ...draft.config.allowedDomains,
        ...presetDraft.config.allowedDomains,
      ]),
      itemSelector: presetDraft.config.itemSelector || draft.config.itemSelector,
      nextPageSelector:
        presetDraft.config.nextPageSelector || draft.config.nextPageSelector,
      fields: presetDraft.config.fields,
    },
  } satisfies ScraperPipelineDraft
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
