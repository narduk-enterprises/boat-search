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
const BOATS_COM_LABEL = 'Boats.com Search'
const BOATS_COM_ALLOWED_DOMAINS = ['www.boats.com', 'images.boats.com']
const EMPTY_DRAFT_FINGERPRINT = JSON.stringify(createEmptyDraft())
const YACHTWORLD_FEATURE_SECTION_HEADINGS = [
  'Electrical Equipment',
  'Electronics',
  'Inside Equipment',
  'Outside Equipment',
  'Additional Equipment',
  'Covers',
  'Rigging',
  'Miscellaneous Equipment',
] as const
const YACHTWORLD_PROPULSION_FIELD_LABELS = [
  'Engine Make',
  'Engine Model',
  'Engine Year',
  'Total Power',
  'Engine Hours',
  'Engine Type',
  'Drive Type',
  'Fuel Type',
  'Propeller Type',
  'Propeller Material',
] as const
const YACHTWORLD_SPEC_FIELD_LABELS = [
  'Cruising Speed',
  'Max Speed',
  'Range',
  'Length Overall',
  'Max Bridge Clearance',
  'Max Draft',
  'Min Draft',
  'Beam',
  'Dry Weight',
  'Windlass',
  'Electrical Circuit',
  'Deadrise At Transom',
  'Hull Material',
  'Hull Shape',
  'Keel Type',
  'Fresh Water Tank',
  'Fuel Tank',
  'Holding Tank',
  'Guest Heads',
] as const
const YACHTWORLD_SPEC_SECTION_MARKERS = [
  'Speed & Distance',
  'Dimensions',
  'Weights',
  'Miscellaneous',
  'Tanks',
  'Accommodations',
] as const
const YACHTWORLD_SECTION_CALLOUT_PATTERNS = [
  /Show More/gi,
  /Need more details\?Ask the seller/gi,
  /Want more features\?Ask the seller/gi,
  /Want more specs\?Ask the seller/gi,
]
const PHONE_PATTERN =
  /(?:\+?1[-.\s]*)?(?:\(\d{3}\)|\d{3})[-.\s]*\d{3}[-.\s]*\d{4}/

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

function cleanYachtWorldSectionText(value: string | null | undefined) {
  let normalized = normalizeTitle(value)
  if (!normalized) {
    return null
  }

  for (const pattern of YACHTWORLD_SECTION_CALLOUT_PATTERNS) {
    normalized = normalized.replace(pattern, ' ')
  }

  normalized = normalizeTitle(normalized)
  return normalized || null
}

function normalizeStructuredListValue(value: string | null | undefined) {
  const normalized = cleanYachtWorldSectionText(value)
  if (!normalized) {
    return null
  }

  const expanded = normalized
    .replace(/([a-z0-9✓)])([A-Z])/g, '$1\n$2')
    .replace(/:\s*(?=\S)/g, ': ')

  const parts = expanded
    .split(/\n+/)
    .map((part) =>
      normalizeTitle(part)
        .replace(/:\s*✓$/i, '')
        .replace(/:\s*$/i, '')
        .trim(),
    )
    .filter(
      (part) =>
        Boolean(part) &&
        !/^(?:Need more details\?|Want more features\?|Want more specs\?|Ask the seller)$/i.test(
          part,
        ),
    )

  return parts.length ? parts.join(' | ') : null
}

function joinUniqueValues(values: Array<string | null | undefined>) {
  const normalized = uniqueStrings(values.map((value) => normalizeTitle(value)).filter(Boolean))
  return normalized.length ? normalized.join(' | ') : null
}

function assignDerivedRecordValue<K extends keyof BrowserScrapeRecord>(
  record: BrowserScrapeRecord,
  key: K,
  value: BrowserScrapeRecord[K] | null | undefined,
) {
  const normalized =
    typeof value === 'string'
      ? normalizeTitle(value)
      : Array.isArray(value)
        ? value
        : value
  if (normalized == null || normalized === '') {
    return
  }

  const existing = record[key]
  if (
    existing != null &&
    existing !== '' &&
    (!Array.isArray(existing) || existing.length > 0)
  ) {
    return
  }

  record[key] = normalized as BrowserScrapeRecord[K]
  if (typeof normalized === 'string') {
    record.rawFields[key as string] = normalized
  }
}

function findHeadingOccurrence(
  text: string,
  heading: string,
  options: {
    before?: number
    after?: number
    validate?: (tail: string) => boolean
  } = {},
) {
  const before =
    typeof options.before === 'number' && options.before >= 0 ? options.before : text.length
  const after = typeof options.after === 'number' && options.after >= 0 ? options.after : 0
  const haystack = text.slice(after, before)

  let searchFrom = haystack.length
  while (searchFrom >= 0) {
    const localIndex = haystack.lastIndexOf(heading, searchFrom)
    if (localIndex < 0) {
      return -1
    }

    const absoluteIndex = after + localIndex
    const tail = normalizeTitle(text.slice(absoluteIndex + heading.length, absoluteIndex + heading.length + 160))
    if (!options.validate || options.validate(tail)) {
      return absoluteIndex
    }

    searchFrom = localIndex - 1
  }

  return -1
}

function extractIndexedSection(
  text: string,
  heading: string,
  startIndex: number,
  endIndexes: number[],
) {
  if (startIndex < 0) {
    return null
  }

  const nextIndex = endIndexes
    .filter((index) => index > startIndex)
    .sort((left, right) => left - right)[0]

  return cleanYachtWorldSectionText(
    text.slice(startIndex + heading.length, nextIndex && nextIndex > 0 ? nextIndex : undefined),
  )
}

function buildLookaheadPattern(literalMarkers: string[], regexMarkers: string[] = []) {
  return [...literalMarkers.map((marker) => escapeRegExp(marker)), ...regexMarkers].join('|')
}

function extractLabeledChunk(
  text: string | null | undefined,
  label: string,
  literalMarkers: string[],
  regexMarkers: string[] = [],
) {
  const normalized = cleanYachtWorldSectionText(text)
  if (!normalized) {
    return null
  }

  const lookahead = buildLookaheadPattern(
    literalMarkers.filter((marker) => marker !== label),
    regexMarkers,
  )
  const match = normalized.match(
    new RegExp(
      `${escapeRegExp(label)}:?\\s*(.*?)\\s*(?=${lookahead ? `(?:${lookahead})` : '$'}|$)`,
      'i',
    ),
  )

  return cleanYachtWorldSectionText(match?.[1] || null)
}

function extractRepeatedLabeledValues(
  text: string | null | undefined,
  label: string,
  literalMarkers: string[],
  regexMarkers: string[] = [],
) {
  const normalized = cleanYachtWorldSectionText(text)
  if (!normalized) {
    return []
  }

  const lookahead = buildLookaheadPattern(
    literalMarkers.filter((marker) => marker !== label),
    regexMarkers,
  )
  const pattern = new RegExp(
    `${escapeRegExp(label)}:?\\s*(.*?)\\s*(?=${lookahead ? `(?:${lookahead})` : '$'}|$)`,
    'gi',
  )
  const values: string[] = []

  for (const match of normalized.matchAll(pattern)) {
    const value = cleanYachtWorldSectionText(match[1] || null)
    if (value) {
      values.push(value)
    }
  }

  return values
}

function extractYachtWorldDetailSections(fullText: string | null | undefined) {
  const normalized = cleanYachtWorldSectionText(fullText)
  if (!normalized) {
    return {
      contactInfo: null,
      otherDetails: null,
      features: null,
      propulsion: null,
      specifications: null,
    }
  }

  const specificationsIndex = findHeadingOccurrence(normalized, 'Specifications', {
    validate: (tail) =>
      /^(?:Speed & Distance|Dimensions|Weights|Miscellaneous|Tanks|Accommodations|Length Overall:|Min Draft:|Beam:)/i.test(
        tail,
      ),
  })
  const propulsionIndex = findHeadingOccurrence(normalized, 'Propulsion', {
    before: specificationsIndex >= 0 ? specificationsIndex : normalized.length,
    validate: (tail) => /^(?:Engine \d|Engine Make:)/i.test(tail),
  })
  const featuresIndex = findHeadingOccurrence(normalized, 'Features', {
    before:
      propulsionIndex >= 0
        ? propulsionIndex
        : specificationsIndex >= 0
          ? specificationsIndex
          : normalized.length,
    validate: (tail) =>
      new RegExp(`^(?:${YACHTWORLD_FEATURE_SECTION_HEADINGS.map((value) => escapeRegExp(value)).join('|')})`, 'i').test(
        tail,
      ),
  })
  const otherDetailsIndex = findHeadingOccurrence(normalized, 'Other Details', {
    before:
      featuresIndex >= 0
        ? featuresIndex
        : propulsionIndex >= 0
          ? propulsionIndex
          : specificationsIndex >= 0
            ? specificationsIndex
            : normalized.length,
  })
  const contactInfoIndex = findHeadingOccurrence(normalized, 'Contact Information', {
    before:
      otherDetailsIndex >= 0
        ? otherDetailsIndex
        : featuresIndex >= 0
          ? featuresIndex
          : propulsionIndex >= 0
            ? propulsionIndex
            : specificationsIndex >= 0
              ? specificationsIndex
              : normalized.length,
    validate: (tail) => /^(?:Please contact|Ask the seller)/i.test(tail),
  })

  return {
    contactInfo: extractIndexedSection(normalized, 'Contact Information', contactInfoIndex, [
      otherDetailsIndex,
      featuresIndex,
      propulsionIndex,
      specificationsIndex,
    ]),
    otherDetails: extractIndexedSection(normalized, 'Other Details', otherDetailsIndex, [
      featuresIndex,
      propulsionIndex,
      specificationsIndex,
    ]),
    features: extractIndexedSection(normalized, 'Features', featuresIndex, [
      propulsionIndex,
      specificationsIndex,
    ]),
    propulsion: extractIndexedSection(normalized, 'Propulsion', propulsionIndex, [
      specificationsIndex,
    ]),
    specifications: extractIndexedSection(normalized, 'Specifications', specificationsIndex, []),
  }
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

  if (!deduped.size) {
    for (const image of images) {
      try {
        const parsed = new URL(image)
        const hostname = parsed.hostname.toLowerCase()
        const pathname = parsed.pathname.toLowerCase()

        if (
          !/^https?:$/i.test(parsed.protocol) ||
          (hostname !== 'images.yachtworld.com' &&
            !hostname.endsWith('boatsgroup.com') &&
            hostname !== 'imt.boatwizard.com') ||
          pathname.includes('/upload/') ||
          pathname.includes('/profiles/') ||
          /(?:^|\/)(?:sprite|icon|logo|avatar|placeholder|blank|tracking|pixel|spinner)/i.test(
            pathname,
          )
        ) {
          continue
        }

        const identity = normalizeImageIdentity(image)
        if (!deduped.has(identity)) {
          deduped.set(identity, image)
        }
      } catch {
        continue
      }
    }
  }

  return [...deduped.values()]
}

function inferYachtWorldListingTypeFromPageUrl(pageUrl: string | null | undefined) {
  const normalized = normalizeTitle(pageUrl).toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized.includes('/condition-used/')) return 'used'
  if (normalized.includes('/condition-new/')) return 'new'

  return null
}

function splitBoatsComTitle(title: string | null | undefined) {
  const normalized = normalizeTitle(title).replace(/^(?:19|20)\d{2}\s+/, '')
  if (!normalized) {
    return {
      make: null,
      model: null,
    }
  }

  const [make = '', ...modelParts] = normalized.split(/\s+/)

  return {
    make: make || null,
    model: modelParts.join(' ').trim() || null,
  }
}

function isBoatsComBoatImageUrl(url: string, listingId: string | null | undefined) {
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    const pathname = parsed.pathname.toLowerCase()

    if (!/^https?:$/i.test(parsed.protocol) || hostname !== 'images.boats.com') {
      return false
    }

    if (
      /(?:^|\/)(?:sprite|icon|logo|avatar|placeholder|blank|tracking|pixel|spinner|preloader)/i.test(
        pathname,
      )
    ) {
      return false
    }

    if (listingId && !pathname.includes(`-${listingId}-`)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

function normalizeBoatsComImages(images: string[], listingId: string | null | undefined) {
  const deduped = new Map<string, string>()

  for (const image of images) {
    if (!isBoatsComBoatImageUrl(image, listingId)) {
      continue
    }

    const identity = normalizeImageIdentity(image)
    if (!deduped.has(identity)) {
      deduped.set(identity, image)
    }
  }

  if (!deduped.size) {
    for (const image of images) {
      if (!isBoatsComBoatImageUrl(image, null)) {
        continue
      }

      const identity = normalizeImageIdentity(image)
      if (!deduped.has(identity)) {
        deduped.set(identity, image)
      }
    }
  }

  return [...deduped.values()]
}

function inferBoatsComListingTypeFromPageUrl(pageUrl: string | null | undefined) {
  try {
    const url = new URL(pageUrl || '')
    const condition = normalizeTitle(url.searchParams.get('condition')).toLowerCase()

    if (condition.includes('used')) return 'used'
    if (condition.includes('new')) return 'new'

    return null
  } catch {
    return null
  }
}

function createBoatsComPipelineName(pageUrl: string) {
  try {
    const url = new URL(pageUrl)
    const boatClass = normalizeTitle(url.searchParams.get('class'))
    if (!boatClass) {
      return 'Boats.com Search Pipeline'
    }

    const label = boatClass
      .replaceAll(/[-_]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase())

    return `Boats.com ${label} Pipeline`
  } catch {
    return 'Boats.com Search Pipeline'
  }
}

function getBoatsComSearchFields(analysis?: AutoDetectedAnalysis | null) {
  const inferredFields =
    analysis?.pageType === 'search' && analysis.pageState === 'ok'
      ? analysis.fields.filter((field) => field.scope === 'item')
      : []

  const staticFields = [
    createFieldRule('url', 'item', 'a[href*="/power-boats/"]', {
      extract: 'attr',
      attribute: 'href',
      transform: 'url',
    }),
    createFieldRule('listingId', 'item', 'a[href*="/power-boats/"]', {
      extract: 'attr',
      attribute: 'href',
      regex: '-(\\d{6,})(?:/|$)',
      required: false,
    }),
    createFieldRule('title', 'item', 'h2'),
    createFieldRule('year', 'item', '.year', {
      transform: 'year',
      required: false,
    }),
    createFieldRule('price', 'item', '.price', {
      transform: 'price',
      regex: '((?:US|C|CA)?\\$\\s*[\\d,.]+|€\\s*[\\d,.]+|£\\s*[\\d,.]+)',
      required: false,
    }),
    createFieldRule('currency', 'item', '.price', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'item', '.country', {
      required: false,
    }),
    createFieldRule('city', 'item', '.country', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'item', '.country', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'item', '.country', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('images', 'item', '.img-container img', {
      extract: 'attr',
      attribute: 'src',
      multiple: true,
      transform: 'url',
      required: false,
    }),
  ]

  // Boats.com card anchors wrap the full tile, so analyzer-inferred item fields
  // can capture badges, seller text, and other noise. Keep trusted static
  // selectors authoritative for overlapping keys.
  return mergeFieldRules(inferredFields, staticFields)
}

function getBoatsComDetailFields() {
  return [
    createFieldRule('listingId', 'detail', 'link[rel="canonical"]', {
      extract: 'attr',
      attribute: 'href',
      regex: '-(\\d{6,})(?:/|$)',
      transform: 'text',
      required: false,
    }),
    createFieldRule('title', 'detail', 'section.boat-details h1, .boat-details h1, h1'),
    createFieldRule('year', 'detail', 'title', {
      regex: '^((?:19|20)\\d{2})\\b',
      transform: 'year',
      required: false,
    }),
    createFieldRule('price', 'detail', 'section.boat-details .details-header .price, section.boat-details .price', {
      transform: 'price',
      regex: '((?:US|C|CA)?\\$\\s*[\\d,.]+|€\\s*[\\d,.]+|£\\s*[\\d,.]+)',
      required: false,
    }),
    createFieldRule('currency', 'detail', 'section.boat-details .details-header .price, section.boat-details .price', {
      regex: '(USD|CAD|EUR|GBP|\\$|€|£)',
      required: false,
    }),
    createFieldRule('location', 'detail', '#seller-map-view, button.map-trigger', {
      required: false,
    }),
    createFieldRule('city', 'detail', '#seller-map-view, button.map-trigger', {
      regex: '^([^,]+)',
      required: false,
    }),
    createFieldRule('state', 'detail', '#seller-map-view, button.map-trigger', {
      regex: '^[^,]+,\\s*([^,]+)',
      required: false,
    }),
    createFieldRule('country', 'detail', '#seller-map-view, button.map-trigger', {
      regex: '^[^,]+,\\s*[^,]+,\\s*(.+)$',
      required: false,
    }),
    createFieldRule('length', 'detail', 'main', {
      regex: 'Length\\s+([\\d.]+\\s*ft)',
      required: false,
    }),
    createFieldRule('description', 'detail', 'meta[name="description"]', {
      extract: 'attr',
      attribute: 'content',
      required: false,
    }),
    createFieldRule('images', 'detail', '#detail-carousel img, .img-gallery img', {
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

function buildBoatsComDraft({ pageUrl, analysis }: PresetDraftOptions) {
  const draft = createEmptyDraft()
  const currentHost = (() => {
    try {
      return new URL(pageUrl).hostname
    } catch {
      return ''
    }
  })()

  draft.name = createBoatsComPipelineName(pageUrl)
  draft.boatSource = 'Boats.com'
  draft.description =
    'Trusted Boats.com preset. Search selectors, detail fields, and pagination rules were auto-loaded in the extension.'
  draft.config.startUrls = [pageUrl]
  draft.config.allowedDomains = uniqueStrings([...BOATS_COM_ALLOWED_DOMAINS, currentHost])
  draft.config.itemSelector =
    analysis?.pageType === 'search' && analysis.pageState === 'ok' && analysis.itemSelector
      ? analysis.itemSelector
      : 'li[data-listing-id]'
  draft.config.nextPageSelector =
    analysis?.pageType === 'search' && analysis.pageState === 'ok' && analysis.nextPageSelector
      ? analysis.nextPageSelector
      : 'a.next, a[rel="next"]'
  draft.config.fetchDetailPages = true
  draft.config.fields = [...getBoatsComSearchFields(analysis), ...getBoatsComDetailFields()]

  return draft
}

function normalizeBoatsComRecord(
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

  if (!nextRecord.url && context === 'detail') {
    nextRecord.url = pageUrl
  }

  if (!nextRecord.listingId) {
    nextRecord.listingId = extractListingIdFromUrl(nextRecord.url || pageUrl)
  }

  const titleParts = splitBoatsComTitle(nextRecord.title)
  const locationParts = splitLocationParts(nextRecord.location)

  assignDerivedRecordValue(nextRecord, 'make', titleParts.make)
  assignDerivedRecordValue(nextRecord, 'model', titleParts.model)
  assignDerivedRecordValue(nextRecord, 'city', locationParts.city)
  assignDerivedRecordValue(nextRecord, 'state', locationParts.state)
  assignDerivedRecordValue(nextRecord, 'country', locationParts.country || (nextRecord.location ? 'US' : null))

  nextRecord.currency =
    extractCurrencyFromText(nextRecord.currency) ||
    extractCurrencyFromText(
      typeof nextRecord.rawFields.currency === 'string' ? nextRecord.rawFields.currency : '',
    ) ||
    extractCurrencyFromText(
      typeof nextRecord.rawFields.price === 'string' ? nextRecord.rawFields.price : '',
    ) ||
    (nextRecord.price ? 'USD' : null) ||
    nextRecord.currency

  if (!nextRecord.length) {
    nextRecord.length =
      extractLengthFromText(
        typeof nextRecord.rawFields.length === 'string' ? nextRecord.rawFields.length : '',
      ) || nextRecord.length
  }

  nextRecord.images = normalizeBoatsComImages(nextRecord.images, nextRecord.listingId)
  nextRecord.sellerType = inferSellerType(nextRecord.sellerType) || nextRecord.sellerType
  nextRecord.listingType =
    inferBoatsComListingTypeFromPageUrl(context === 'search' ? pageUrl : null) ||
    normalizeListingType(nextRecord.listingType) ||
    nextRecord.listingType

  return nextRecord
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
  const detailSections = extractYachtWorldDetailSections(fullText)
  const disclaimer =
    extractLabeledChunk(
      detailSections.otherDetails,
      'Disclaimer',
      ['Manufacturer Provided Description', 'Standard Features', 'Disclaimer'],
      ['Need more details\\?Ask the seller', 'Features', 'Propulsion', 'Specifications'],
    ) || null
  const contactInfo = detailSections.contactInfo
  const contactPhone = contactInfo?.match(PHONE_PATTERN)?.[0] || null
  const contactName =
    contactInfo?.match(/Please contact\s+(.+?)\s+at\b/i)?.[1] ||
    contactInfo?.match(/Please contact\s+(.+?)(?=\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4})/i)?.[1] ||
    null
  const electricalEquipment = normalizeStructuredListValue(
    extractLabeledChunk(
      detailSections.features,
      'Electrical Equipment',
      [...YACHTWORLD_FEATURE_SECTION_HEADINGS],
      ['Want more features\\?Ask the seller', 'Propulsion', 'Specifications'],
    ),
  )
  const electronics = normalizeStructuredListValue(
    extractLabeledChunk(
      detailSections.features,
      'Electronics',
      [...YACHTWORLD_FEATURE_SECTION_HEADINGS],
      ['Want more features\\?Ask the seller', 'Propulsion', 'Specifications'],
    ),
  )
  const insideEquipment = normalizeStructuredListValue(
    extractLabeledChunk(
      detailSections.features,
      'Inside Equipment',
      [...YACHTWORLD_FEATURE_SECTION_HEADINGS],
      ['Want more features\\?Ask the seller', 'Propulsion', 'Specifications'],
    ),
  )
  const outsideEquipment = normalizeStructuredListValue(
    extractLabeledChunk(
      detailSections.features,
      'Outside Equipment',
      [...YACHTWORLD_FEATURE_SECTION_HEADINGS],
      ['Want more features\\?Ask the seller', 'Propulsion', 'Specifications'],
    ),
  )
  const additionalEquipment = normalizeStructuredListValue(
    extractLabeledChunk(
      detailSections.features,
      'Additional Equipment',
      [...YACHTWORLD_FEATURE_SECTION_HEADINGS],
      ['Want more features\\?Ask the seller', 'Propulsion', 'Specifications'],
    ),
  )
  const propulsionFieldRegexMarkers = ['Engine \\d+', 'Specifications']
  const specificationsFieldRegexMarkers = [
    ...YACHTWORLD_SPEC_SECTION_MARKERS.map((marker) => escapeRegExp(marker)),
    'Want more specs\\?Ask the seller',
  ]
  const engineMake = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Engine Make',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const engineModel = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Engine Model',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const engineYearDetail = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Engine Year',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const totalPower = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Total Power',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const engineHours = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Engine Hours',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const engineTypeDetail = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Engine Type',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const driveType = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Drive Type',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const fuelTypeDetail = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Fuel Type',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const propellerType = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Propeller Type',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const propellerMaterial = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.propulsion,
      'Propeller Material',
      [...YACHTWORLD_PROPULSION_FIELD_LABELS],
      propulsionFieldRegexMarkers,
    ),
  )
  const cruisingSpeed = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Cruising Speed',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const maxSpeed = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Max Speed',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const range = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Range',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const lengthOverall = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Length Overall',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const maxBridgeClearance = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Max Bridge Clearance',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const maxDraft = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Max Draft',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const minDraftDetail = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Min Draft',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const beamDetail = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Beam',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const dryWeight = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Dry Weight',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const windlass = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Windlass',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const electricalCircuit = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Electrical Circuit',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const deadriseAtTransom = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Deadrise At Transom',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const hullMaterial = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Hull Material',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const hullShape = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Hull Shape',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const keelType = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Keel Type',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const freshWaterTank = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Fresh Water Tank',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const fuelTank = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Fuel Tank',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const holdingTank = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Holding Tank',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
  )
  const guestHeads = joinUniqueValues(
    extractRepeatedLabeledValues(
      detailSections.specifications,
      'Guest Heads',
      [...YACHTWORLD_SPEC_FIELD_LABELS],
      specificationsFieldRegexMarkers,
    ),
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

  assignDerivedRecordValue(nextRecord, 'contactInfo', contactInfo)
  assignDerivedRecordValue(nextRecord, 'contactName', contactName)
  assignDerivedRecordValue(nextRecord, 'contactPhone', contactPhone)
  assignDerivedRecordValue(nextRecord, 'otherDetails', detailSections.otherDetails)
  assignDerivedRecordValue(nextRecord, 'disclaimer', disclaimer)
  assignDerivedRecordValue(nextRecord, 'features', detailSections.features)
  assignDerivedRecordValue(nextRecord, 'electricalEquipment', electricalEquipment)
  assignDerivedRecordValue(nextRecord, 'electronics', electronics)
  assignDerivedRecordValue(nextRecord, 'insideEquipment', insideEquipment)
  assignDerivedRecordValue(nextRecord, 'outsideEquipment', outsideEquipment)
  assignDerivedRecordValue(nextRecord, 'additionalEquipment', additionalEquipment)
  assignDerivedRecordValue(nextRecord, 'propulsion', detailSections.propulsion)
  assignDerivedRecordValue(nextRecord, 'engineMake', engineMake)
  assignDerivedRecordValue(nextRecord, 'engineModel', engineModel)
  assignDerivedRecordValue(nextRecord, 'engineYearDetail', engineYearDetail)
  assignDerivedRecordValue(nextRecord, 'totalPower', totalPower)
  assignDerivedRecordValue(nextRecord, 'engineHours', engineHours)
  assignDerivedRecordValue(nextRecord, 'engineTypeDetail', engineTypeDetail)
  assignDerivedRecordValue(nextRecord, 'driveType', driveType)
  assignDerivedRecordValue(nextRecord, 'fuelTypeDetail', fuelTypeDetail)
  assignDerivedRecordValue(nextRecord, 'propellerType', propellerType)
  assignDerivedRecordValue(nextRecord, 'propellerMaterial', propellerMaterial)
  assignDerivedRecordValue(nextRecord, 'specifications', detailSections.specifications)
  assignDerivedRecordValue(nextRecord, 'cruisingSpeed', cruisingSpeed)
  assignDerivedRecordValue(nextRecord, 'maxSpeed', maxSpeed)
  assignDerivedRecordValue(nextRecord, 'range', range)
  assignDerivedRecordValue(nextRecord, 'lengthOverall', lengthOverall)
  assignDerivedRecordValue(nextRecord, 'maxBridgeClearance', maxBridgeClearance)
  assignDerivedRecordValue(nextRecord, 'maxDraft', maxDraft)
  assignDerivedRecordValue(nextRecord, 'minDraftDetail', minDraftDetail)
  assignDerivedRecordValue(nextRecord, 'beamDetail', beamDetail)
  assignDerivedRecordValue(nextRecord, 'dryWeight', dryWeight)
  assignDerivedRecordValue(nextRecord, 'windlass', windlass)
  assignDerivedRecordValue(nextRecord, 'electricalCircuit', electricalCircuit)
  assignDerivedRecordValue(nextRecord, 'deadriseAtTransom', deadriseAtTransom)
  assignDerivedRecordValue(nextRecord, 'hullMaterial', hullMaterial)
  assignDerivedRecordValue(nextRecord, 'hullShape', hullShape)
  assignDerivedRecordValue(nextRecord, 'keelType', keelType)
  assignDerivedRecordValue(nextRecord, 'freshWaterTank', freshWaterTank)
  assignDerivedRecordValue(nextRecord, 'fuelTank', fuelTank)
  assignDerivedRecordValue(nextRecord, 'holdingTank', holdingTank)
  assignDerivedRecordValue(nextRecord, 'guestHeads', guestHeads)

  nextRecord.images = normalizeYachtWorldImages(nextRecord.images, nextRecord.listingId)
  nextRecord.sellerType = inferSellerType(nextRecord.sellerType || fullText) || nextRecord.sellerType
  nextRecord.listingType =
    nextRecord.listingType ||
    inferYachtWorldListingTypeFromPageUrl(context === 'search' ? pageUrl : null) ||
    normalizeListingType(fullText) ||
    'sale'

  if (!nextRecord.fullText && fullText) {
    nextRecord.fullText = fullText
  }

  return nextRecord
}

const SITE_PRESETS: SitePresetDefinition[] = [
  {
    id: 'boats-com-search',
    label: BOATS_COM_LABEL,
    match: (pageUrl) => {
      try {
        const url = new URL(pageUrl)
        const hostname = url.hostname.toLowerCase()
        if (hostname !== 'www.boats.com' && hostname !== 'boats.com') {
          return null
        }

        if (/\/boats-for-sale\/?/i.test(url.pathname)) {
          return 'search'
        }

        if (/\/power-boats\/?/i.test(url.pathname)) {
          return 'detail'
        }

        return null
      } catch {
        return null
      }
    },
    buildDraft: buildBoatsComDraft,
    normalizeRecord: normalizeBoatsComRecord,
  },
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
