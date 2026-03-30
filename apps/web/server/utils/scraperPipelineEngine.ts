import { and, asc, count, desc, eq, isNotNull, lt, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { load, type CheerioAPI } from 'cheerio'
import {
  SCRAPER_DETAIL_STATUSES,
  SCRAPER_DUPLICATE_DECISIONS,
  SCRAPER_EXTRA_RECORD_TEXT_KEYS,
  SCRAPER_PERSISTENCE_STATUSES,
  scraperPipelineDraftSchema,
  type JsonValue,
  type ScraperExtraRecordTextKey,
  type ScraperBrowserRunListingAudit,
  type ScraperBrowserRunProgress,
  type ScraperBrowserRunRecord,
  type ScraperBrowserRunSummary,
  type ScraperCrawlJobEventType,
  type ScraperDetailStatus,
  type ScraperDuplicateDecision,
  type ScraperFieldRule,
  type ScraperJobAuditDetail,
  type ScraperJobAuditEvent,
  type ScraperJobAuditListing,
  type ScraperJobAuditListingFilters,
  type ScraperJobAuditOverview,
  type ScraperPersistenceStatus,
  type ScraperPipelineDraft,
  type ScraperRunRecord,
  type ScraperRunSummary,
} from '~~/lib/scraperPipeline'
import { cleanBoatDescription } from '#server/utils/boatInventory'
import { rebuildBoatDedupeState, upsertBoatSourceListing } from '#server/utils/boatDedupe'
import { useAppDatabase } from '#server/utils/database'
import { crawlJobEvents, crawlJobListings, crawlJobs } from '#server/database/schema'
import { markScraperPipelineRun } from '#server/utils/scraperPipelineStore'

type SelectorContext = ReturnType<CheerioAPI>

type ExtractedBoatCandidate = ScraperRunRecord

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (compatible; BoatSearchPipeline/1.0; +https://boat-search.nard.uk/admin/scraper-pipeline)',
}

const SCRAPE_AUDIT_RETENTION_DAYS = 30
const SCRAPE_AUDIT_RETENTION_MS = SCRAPE_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000
const PENDING_DETAIL_STATUSES = new Set<ScraperDetailStatus>([
  'not_attempted',
  'queued',
  'retry_queued',
])

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function coerceJsonRecord(
  value: unknown,
): Record<string, JsonValue> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, JsonValue>
}

function parseJsonRecord(
  value: string | null | undefined,
): Record<string, JsonValue> | null {
  if (!value) return null

  try {
    return coerceJsonRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function uniqueStringArrayFromUnknown(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[]
  }

  return dedupeStrings(value.filter((entry): entry is string => typeof entry === 'string'))
}

function mergeAuditJson(
  existing: Record<string, JsonValue> | null,
  next: Record<string, JsonValue> | null,
  warnings: string[],
  errorMessage: string | null,
) {
  const merged = {
    ...(existing ?? {}),
    ...(next ?? {}),
  } satisfies Record<string, JsonValue>
  const mergedWarnings = dedupeStrings([
    ...uniqueStringArrayFromUnknown(existing?.warnings),
    ...uniqueStringArrayFromUnknown(next?.warnings),
    ...warnings,
  ])

  if (mergedWarnings.length) {
    merged.warnings = mergedWarnings
  } else {
    delete merged.warnings
  }

  if (errorMessage) {
    merged.error = errorMessage
  } else {
    delete merged.error
  }

  return Object.keys(merged).length ? merged : null
}

function toBoolean(value: boolean | number | null | undefined) {
  return Boolean(value)
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
}

function createEmptyExtraRecordTextFields() {
  return Object.fromEntries(SCRAPER_EXTRA_RECORD_TEXT_KEYS.map((key) => [key, null])) as Record<
    ScraperExtraRecordTextKey,
    string | null
  >
}

function pickExtraRecordTextFields(
  record: Pick<ExtractedBoatCandidate, ScraperExtraRecordTextKey>,
) {
  return Object.fromEntries(
    SCRAPER_EXTRA_RECORD_TEXT_KEYS.map((key) => [key, record[key] ?? null]),
  ) as Record<ScraperExtraRecordTextKey, string | null>
}

function toStringArray(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return dedupeStrings(value.map((entry) => normalizeWhitespace(entry)).filter(Boolean))
  }

  if (typeof value === 'string') {
    return dedupeStrings(
      value
        .split('\n')
        .map((entry) => normalizeWhitespace(entry))
        .filter(Boolean),
    )
  }

  return []
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function isStoredBoatSearchImageReference(value: string) {
  const normalized = value.trim()
  if (!normalized) return false

  try {
    const url = normalized.startsWith('/')
      ? new URL(normalized, 'https://boat-search.local')
      : new URL(normalized)
    return url.pathname.startsWith('/images/')
  } catch {
    return false
  }
}

function deriveSourceImages(record: ScraperBrowserRunRecord) {
  const rawImages = toStringArray(record.rawFields.images)
  const explicitSourceImages = toStringArray(record.sourceImages)
  const externalCurrentImages = record.images.filter(
    (image) => isHttpUrl(image) && !isStoredBoatSearchImageReference(image),
  )

  return dedupeStrings([...explicitSourceImages, ...rawImages, ...externalCurrentImages])
}

function applyRegex(value: string, pattern: string) {
  if (!pattern) return value

  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- admin-authored pipeline rules need runtime capture patterns
    const match = new RegExp(pattern, 'i').exec(value)
    if (!match) return null
    return normalizeWhitespace(match[1] || match[0] || '')
  } catch {
    return value
  }
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function resolveDetailFollowUrl(
  $: CheerioAPI,
  context: SelectorContext,
  selector: string,
  baseUrl: string,
) {
  const normalizedSelector = selector.trim()
  if (!normalizedSelector) {
    return null
  }

  const candidate = context.find(normalizedSelector).first()
  if (!candidate.length) {
    return null
  }

  const href =
    candidate.attr('href') ||
    candidate.attr('data-href') ||
    candidate.attr('data-url') ||
    ''

  return href ? toAbsoluteUrl(href, baseUrl) : null
}

function applyTransform(value: string, field: ScraperFieldRule, baseUrl: string) {
  const withRegex = applyRegex(value, field.regex || '')
  if (!withRegex) return null

  switch (field.transform) {
    case 'price': {
      const digits = withRegex.replaceAll(/\D/g, '')
      return digits || null
    }
    case 'year': {
      const match = withRegex.match(/\b(19|20)\d{2}\b/)
      return match?.[0] || null
    }
    case 'integer': {
      const match = withRegex.match(/\d+/)
      return match?.[0] || null
    }
    case 'url':
      return toAbsoluteUrl(withRegex, baseUrl)
    case 'text':
    default:
      return normalizeWhitespace(withRegex)
  }
}

function readSelectionValues(
  $: CheerioAPI,
  context: SelectorContext,
  field: ScraperFieldRule,
  baseUrl: string,
) {
  const selection = field.selector === ':root' ? context : context.find(field.selector)

  if (!selection.length) return null

  const resolvedValues = selection
    .toArray()
    .map((element) => {
      const item = $(element)
      const rawValue =
        field.extract === 'attr'
          ? item.attr(field.attribute || '') || ''
          : field.extract === 'html'
            ? item.html() || ''
            : item.text()
      return applyTransform(rawValue, field, baseUrl)
    })
    .filter((value): value is string => Boolean(value))

  if (!resolvedValues.length) return null
  if (field.multiple || field.key === 'images') return dedupeStrings(resolvedValues)
  return resolvedValues[0] || null
}

function createEmptyCandidate(source: string): ExtractedBoatCandidate {
  return {
    source,
    url: null,
    listingId: null,
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
    ...createEmptyExtraRecordTextFields(),
    sellerType: null,
    listingType: null,
    images: [],
    sourceImages: [],
    fullText: null,
    rawFields: {},
    warnings: [],
  }
}

function fromBrowserRunRecord(
  record: ScraperBrowserRunRecord,
  fallbackSource: string,
): ExtractedBoatCandidate {
  const candidate = createEmptyCandidate(record.source || fallbackSource)
  candidate.url = record.url
  candidate.listingId = record.listingId
  candidate.title = record.title
  candidate.make = record.make
  candidate.model = record.model
  candidate.year = record.year
  candidate.length = record.length
  candidate.price = record.price
  candidate.currency = record.currency
  candidate.location = record.location
  candidate.city = record.city
  candidate.state = record.state
  candidate.country = record.country
  candidate.description = record.description
  for (const key of SCRAPER_EXTRA_RECORD_TEXT_KEYS) {
    candidate[key] = record[key] ?? null
  }
  candidate.sellerType = record.sellerType
  candidate.listingType = record.listingType
  candidate.images = record.images
  candidate.sourceImages = deriveSourceImages(record)
  candidate.fullText = record.fullText
  candidate.rawFields = record.rawFields
  candidate.warnings = [...record.warnings]
  finalizeCandidate(candidate)
  return candidate
}

function assignFieldValue(
  candidate: ExtractedBoatCandidate,
  field: ScraperFieldRule,
  value: string | string[] | null,
) {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    if (field.required) {
      candidate.warnings.push(`Missing required field: ${field.key}`)
    }
    return
  }

  candidate.rawFields[field.key] = value

  switch (field.key) {
    case 'images':
      candidate.images = Array.isArray(value) ? value : [value]
      return
    case 'year':
      candidate.year = typeof value === 'string' ? Number.parseInt(value, 10) || null : null
      return
    default: {
      const nextValue = Array.isArray(value) ? value.join(field.joinWith) : value
      switch (field.key) {
        case 'url':
          candidate.url = nextValue
          break
        case 'listingId':
          candidate.listingId = nextValue
          break
        case 'title':
          candidate.title = nextValue
          break
        case 'make':
          candidate.make = nextValue
          break
        case 'model':
          candidate.model = nextValue
          break
        case 'length':
          candidate.length = nextValue
          break
        case 'price':
          candidate.price = nextValue
          break
        case 'currency':
          candidate.currency = nextValue
          break
        case 'location':
          candidate.location = nextValue
          break
        case 'city':
          candidate.city = nextValue
          break
        case 'state':
          candidate.state = nextValue
          break
        case 'country':
          candidate.country = nextValue
          break
        case 'description':
          candidate.description = nextValue
          break
        case 'sellerType':
          candidate.sellerType = nextValue
          break
        case 'listingType':
          candidate.listingType = nextValue
          break
        case 'fullText':
          candidate.fullText = nextValue
          break
      }
    }
  }
}

function parseTitleParts(title: string | null) {
  if (!title) {
    return {
      year: null as number | null,
      make: null as string | null,
      model: null as string | null,
    }
  }

  const normalized = normalizeWhitespace(title)
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/)
  const year = yearMatch ? Number.parseInt(yearMatch[0], 10) : null
  const withoutYear = normalized.replace(/\b(19|20)\d{2}\b/, '').trim()
  const parts = withoutYear.split(' ').filter(Boolean)

  return {
    year,
    make: parts[0] || null,
    model: parts.length > 1 ? parts.slice(1).join(' ') : null,
  }
}

function deriveLocation(candidate: ExtractedBoatCandidate) {
  if (!candidate.location || candidate.city || candidate.state) return

  const parts = candidate.location
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)

  if (parts.length >= 2) {
    candidate.city = parts[0] || candidate.city
    candidate.state = parts[1] || candidate.state
  }
  if (parts.length >= 3) {
    candidate.country = parts[2] || candidate.country
  }
}

function finalizeCandidate(candidate: ExtractedBoatCandidate) {
  const parsedTitle = parseTitleParts(candidate.title)

  if (!candidate.year) candidate.year = parsedTitle.year
  if (!candidate.make) candidate.make = parsedTitle.make
  if (!candidate.model) candidate.model = parsedTitle.model
  if (!candidate.description) candidate.description = cleanBoatDescription(candidate.fullText)
  candidate.description = cleanBoatDescription(candidate.description)
  candidate.images = dedupeStrings(candidate.images)
  candidate.sourceImages = dedupeStrings(
    candidate.sourceImages.length
      ? candidate.sourceImages
      : candidate.images.filter(
          (image) => isHttpUrl(image) && !isStoredBoatSearchImageReference(image),
        ),
  )
  deriveLocation(candidate)
  candidate.currency = candidate.currency || 'USD'
  candidate.country = candidate.country || 'US'
}

function resolveAllowedDomains(draft: ScraperPipelineDraft) {
  const domains = new Set(
    draft.config.allowedDomains.map((domain) => domain.trim().toLowerCase()).filter(Boolean),
  )

  for (const startUrl of draft.config.startUrls) {
    try {
      domains.add(new URL(startUrl).hostname.toLowerCase())
    } catch {
      // Schema validation catches bad URLs later.
    }
  }

  return domains
}

function isAllowedUrl(url: string, allowedDomains: Set<string>) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return [...allowedDomains].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  } catch {
    return false
  }
}

async function fetchHtml(url: string, allowedDomains: Set<string>) {
  if (!isAllowedUrl(url, allowedDomains)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Blocked cross-domain request for ${url}`,
    })
  }

  const response = await fetch(url, {
    headers: FETCH_HEADERS,
    redirect: 'follow',
  })

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Upstream fetch failed (${response.status}) for ${url}`,
    })
  }

  return {
    url: response.url,
    html: await response.text(),
  }
}

async function getDetailDocument(
  url: string,
  allowedDomains: Set<string>,
  cache: Map<string, Promise<CheerioAPI>>,
) {
  if (!cache.has(url)) {
    cache.set(
      url,
      (async () => {
        const detailPage = await fetchHtml(url, allowedDomains)
        return load(detailPage.html)
      })(),
    )
  }

  return cache.get(url)!
}

async function extractCandidateFromItem(
  $page: CheerioAPI,
  itemIndex: number,
  pageUrl: string,
  draft: ScraperPipelineDraft,
  allowedDomains: Set<string>,
  detailCache: Map<string, Promise<CheerioAPI>>,
) {
  const item = $page(draft.config.itemSelector).eq(itemIndex)
  const candidate = createEmptyCandidate(draft.boatSource)
  const itemFields = draft.config.fields.filter((field) => field.scope === 'item')
  const detailFields = draft.config.fields.filter((field) => field.scope === 'detail')
  const detailFollowFields = draft.config.fields.filter((field) => field.scope === 'detail-follow')

  for (const field of itemFields) {
    assignFieldValue(candidate, field, readSelectionValues($page, item, field, pageUrl))
  }

  if (candidate.url && draft.config.fetchDetailPages && (detailFields.length || detailFollowFields.length)) {
    const $detail = await getDetailDocument(candidate.url, allowedDomains, detailCache)

    for (const field of detailFields) {
      assignFieldValue(
        candidate,
        field,
        readSelectionValues($detail, $detail.root(), field, candidate.url),
      )
    }

    if (detailFollowFields.length && draft.config.detailFollowLinkSelector) {
      const detailFollowUrl = resolveDetailFollowUrl(
        $detail,
        $detail.root(),
        draft.config.detailFollowLinkSelector,
        candidate.url,
      )

      if (detailFollowUrl) {
        const $detailFollow = await getDetailDocument(detailFollowUrl, allowedDomains, detailCache)
        for (const field of detailFollowFields) {
          assignFieldValue(
            candidate,
            field,
            readSelectionValues($detailFollow, $detailFollow.root(), field, detailFollowUrl),
          )
        }
      }
    }
  }

  finalizeCandidate(candidate)

  if (!candidate.url) {
    candidate.warnings.push('Skipped record because no URL could be extracted.')
    return null
  }

  return candidate
}

async function executeScraperPipeline(draftInput: ScraperPipelineDraft) {
  const draft = scraperPipelineDraftSchema.parse(draftInput)
  const allowedDomains = resolveAllowedDomains(draft)
  const visitedUrls: string[] = []
  const seenPageUrls = new Set<string>()
  const warnings: string[] = []
  const detailCache = new Map<string, Promise<CheerioAPI>>()
  const records: ExtractedBoatCandidate[] = []
  let itemsSeen = 0

  for (const startUrl of draft.config.startUrls) {
    let currentUrl = startUrl
    let pageIndex = 0

    while (
      currentUrl &&
      pageIndex < draft.config.maxPages &&
      records.length < draft.config.maxItemsPerRun
    ) {
      if (seenPageUrls.has(currentUrl)) {
        warnings.push(`Stopped pagination loop at ${currentUrl}`)
        break
      }

      const page = await fetchHtml(currentUrl, allowedDomains)
      seenPageUrls.add(currentUrl)
      visitedUrls.push(page.url)
      pageIndex += 1

      const $page = load(page.html)
      const items = $page(draft.config.itemSelector)
      itemsSeen += items.length

      if (!items.length) {
        warnings.push(`No items matched ${draft.config.itemSelector} on ${page.url}`)
      }

      for (let index = 0; index < items.length; index += 1) {
        if (records.length >= draft.config.maxItemsPerRun) break
        const candidate = await extractCandidateFromItem(
          $page,
          index,
          page.url,
          draft,
          allowedDomains,
          detailCache,
        )

        if (candidate) {
          records.push(candidate)
        }
      }

      if (!draft.config.nextPageSelector || records.length >= draft.config.maxItemsPerRun) {
        break
      }

      const nextHref = $page(draft.config.nextPageSelector).first().attr('href')
      if (!nextHref) break

      const nextUrl = toAbsoluteUrl(nextHref, page.url)
      if (!nextUrl) {
        warnings.push(`Could not resolve next page URL from ${nextHref}`)
        break
      }

      currentUrl = nextUrl
    }
  }

  return {
    draft,
    records,
    summary: {
      pagesVisited: visitedUrls.length,
      itemsSeen,
      itemsExtracted: records.length,
      skippedExisting: 0,
      inserted: 0,
      updated: 0,
      visitedUrls,
      warnings: dedupeStrings([...warnings, ...records.flatMap((record) => record.warnings)]),
      records,
    } satisfies ScraperRunSummary,
  }
}

function toBoatInsertValues(candidate: ExtractedBoatCandidate, now: string) {
  return {
    listingId: candidate.listingId,
    source: candidate.source,
    url: candidate.url!,
    make: candidate.make,
    model: candidate.model,
    year: candidate.year,
    length: candidate.length,
    price: candidate.price,
    currency: candidate.currency || 'USD',
    location: candidate.location,
    city: candidate.city,
    state: candidate.state,
    country: candidate.country || 'US',
    description: candidate.description,
    ...pickExtraRecordTextFields(candidate),
    sellerType: candidate.sellerType,
    listingType: candidate.listingType,
    images: candidate.images.length ? JSON.stringify(candidate.images) : null,
    sourceImages: candidate.sourceImages.length ? JSON.stringify(candidate.sourceImages) : null,
    fullText: candidate.fullText,
    scrapedAt: now,
    updatedAt: now,
    searchLengthMin: null,
    searchLengthMax: null,
    searchType: null,
    searchLocation: null,
  }
}

async function persistCandidates(
  event: H3Event,
  candidates: ExtractedBoatCandidate[],
  options: { rebuildAfter?: boolean } = {},
) {
  const uniqueCandidates = [
    ...new Map(
      candidates
        .filter((candidate): candidate is ExtractedBoatCandidate & { url: string } =>
          Boolean(candidate.url),
        )
        .map((candidate) => [
          candidate.listingId ? `${candidate.source}::${candidate.listingId}` : candidate.url,
          candidate,
        ]),
    ).values(),
  ]
  let inserted = 0
  let updated = 0

  for (const candidate of uniqueCandidates) {
    const now = new Date().toISOString()
    const values = toBoatInsertValues(candidate, now)
    const persisted = await upsertBoatSourceListing(event, values)
    inserted += persisted.inserted
    updated += persisted.updated
  }

  if ((options.rebuildAfter ?? true) && uniqueCandidates.length > 0) {
    await rebuildBoatDedupeState(event)
  }

  return { inserted, updated }
}

function toFinalRunSummary(
  summary: ScraperBrowserRunSummary,
  candidates: ExtractedBoatCandidate[],
  inserted: number,
  updated: number,
): ScraperRunSummary {
  return {
    pagesVisited: summary.pagesVisited,
    itemsSeen: summary.itemsSeen,
    itemsExtracted: summary.itemsExtracted,
    skippedExisting: summary.skippedExisting,
    inserted,
    updated,
    visitedUrls: summary.visitedUrls,
    warnings: dedupeStrings([
      ...summary.warnings,
      ...candidates.flatMap((candidate) => candidate.warnings),
    ]),
    records: candidates,
  }
}

async function pruneExpiredCrawlJobAudit(event: H3Event) {
  const db = useAppDatabase(event)
  const cutoff = new Date(Date.now() - SCRAPE_AUDIT_RETENTION_MS).toISOString()

  await db.delete(crawlJobEvents).where(lt(crawlJobEvents.createdAt, cutoff)).run()
  await db.delete(crawlJobListings).where(lt(crawlJobListings.firstSeenAt, cutoff)).run()
}

async function appendCrawlJobEvent(
  event: H3Event,
  params: {
    jobId: number
    eventType: ScraperCrawlJobEventType
    status: string
    message?: string | null
    pageNumber?: number | null
    searchUrl?: string | null
    payload?: Record<string, JsonValue> | null
    createdAt?: string
  },
) {
  const db = useAppDatabase(event)
  await db
    .insert(crawlJobEvents)
    .values({
      crawlJobId: params.jobId,
      eventType: params.eventType,
      status: params.status,
      message: params.message ?? null,
      pageNumber: params.pageNumber ?? null,
      searchUrl: params.searchUrl ?? null,
      payloadJson: params.payload ? JSON.stringify(params.payload) : null,
      createdAt: params.createdAt ?? new Date().toISOString(),
    })
    .run()
}

function resolvePersistenceStatus(
  persisted: Awaited<ReturnType<typeof upsertBoatSourceListing>>,
): ScraperPersistenceStatus {
  if (persisted.inserted > 0) {
    return 'inserted'
  }

  if (persisted.updated > 0) {
    return 'updated'
  }

  return 'unchanged'
}

export async function storeCrawlJobListingAudit(
  event: H3Event,
  params: {
    jobId: number
    listing: ScraperBrowserRunListingAudit
    persistenceStatus?: ScraperPersistenceStatus
    persistedBoatId?: number | null
    errorMessage?: string | null
  },
) {
  const db = useAppDatabase(event)
  const now = new Date().toISOString()
  const existing = await db
    .select()
    .from(crawlJobListings)
    .where(
      and(
        eq(crawlJobListings.crawlJobId, params.jobId),
        eq(crawlJobListings.identityKey, params.listing.identityKey),
      ),
    )
    .limit(1)
    .get()
  const existingAudit = parseJsonRecord(existing?.auditJson)
  const mergedAudit = mergeAuditJson(
    existingAudit,
    coerceJsonRecord(params.listing.auditJson),
    params.listing.warnings,
    params.errorMessage ?? params.listing.error ?? null,
  )
  const values = {
    crawlJobId: params.jobId,
    identityKey: params.listing.identityKey,
    source: params.listing.source || existing?.source || 'unknown',
    listingId: params.listing.listingId ?? existing?.listingId ?? null,
    listingUrl: params.listing.listingUrl ?? existing?.listingUrl ?? null,
    detailUrl:
      params.listing.detailUrl ??
      params.listing.listingUrl ??
      existing?.detailUrl ??
      existing?.listingUrl ??
      null,
    discoveredOnPage: params.listing.pageNumber ?? existing?.discoveredOnPage ?? null,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastUpdatedAt: now,
    duplicateDecision:
      (params.listing.duplicateDecision ||
        existing?.duplicateDecision ||
        'new') as ScraperDuplicateDecision,
    detailStatus:
      (params.listing.detailStatus || existing?.detailStatus || 'not_attempted') as ScraperDetailStatus,
    detailAttempts: Math.max(existing?.detailAttempts ?? 0, params.listing.detailAttempts),
    retryQueued: params.listing.retryQueued || toBoolean(existing?.retryQueued),
    persistenceStatus:
      params.persistenceStatus ?? (existing?.persistenceStatus as ScraperPersistenceStatus | null) ?? 'not_attempted',
    persistedBoatId: params.persistedBoatId ?? existing?.persistedBoatId ?? null,
    finalImageCount: params.listing.finalImageCount ?? existing?.finalImageCount ?? null,
    finalHasStructuredDetails:
      params.listing.finalHasStructuredDetails || toBoolean(existing?.finalHasStructuredDetails),
    weakFingerprint: params.listing.weakFingerprint,
    errorMessage: params.errorMessage ?? params.listing.error ?? existing?.errorMessage ?? null,
    auditJson: mergedAudit ? JSON.stringify(mergedAudit) : null,
  }

  if (existing) {
    await db
      .update(crawlJobListings)
      .set(values)
      .where(eq(crawlJobListings.id, existing.id))
      .run()
  } else {
    await db.insert(crawlJobListings).values(values).run()
  }
}

export async function markCrawlJobStopRequested(
  event: H3Event,
  params: { jobId: number; message: string },
) {
  await appendCrawlJobEvent(event, {
    jobId: params.jobId,
    eventType: 'stop_requested',
    status: 'stopping',
    message: params.message,
  })
}

async function markPendingCrawlJobListingsStopped(
  event: H3Event,
  params: { jobId: number; message: string },
) {
  const db = useAppDatabase(event)
  const pendingRows = await db
    .select()
    .from(crawlJobListings)
    .where(eq(crawlJobListings.crawlJobId, params.jobId))
    .all()

  for (const row of pendingRows) {
    if (!PENDING_DETAIL_STATUSES.has(row.detailStatus as ScraperDetailStatus)) {
      continue
    }

    const mergedAudit = mergeAuditJson(
      parseJsonRecord(row.auditJson),
      null,
      [],
      params.message,
    )

    await db
      .update(crawlJobListings)
      .set({
        detailStatus: 'stopped',
        lastUpdatedAt: new Date().toISOString(),
        errorMessage: params.message,
        auditJson: mergedAudit ? JSON.stringify(mergedAudit) : null,
      })
      .where(eq(crawlJobListings.id, row.id))
      .run()
  }
}

function parseWarningsFromAudit(audit: Record<string, JsonValue> | null) {
  return uniqueStringArrayFromUnknown(audit?.warnings)
}

function toAuditListing(row: typeof crawlJobListings.$inferSelect): ScraperJobAuditListing {
  const audit = parseJsonRecord(row.auditJson)

  return {
    id: row.id,
    crawlJobId: row.crawlJobId,
    identityKey: row.identityKey,
    source: row.source,
    listingId: row.listingId,
    listingUrl: row.listingUrl,
    detailUrl: row.detailUrl,
    discoveredOnPage: row.discoveredOnPage,
    firstSeenAt: row.firstSeenAt,
    lastUpdatedAt: row.lastUpdatedAt,
    duplicateDecision: row.duplicateDecision as ScraperDuplicateDecision,
    detailStatus: row.detailStatus as ScraperDetailStatus,
    detailAttempts: row.detailAttempts,
    retryQueued: row.retryQueued,
    persistenceStatus: row.persistenceStatus as ScraperPersistenceStatus,
    persistedBoatId: row.persistedBoatId,
    finalImageCount: row.finalImageCount,
    finalHasStructuredDetails: row.finalHasStructuredDetails,
    weakFingerprint: row.weakFingerprint,
    errorMessage: row.errorMessage,
    warnings: parseWarningsFromAudit(audit),
    audit,
  }
}

function buildDefaultJobAuditFilters(
  input: Partial<ScraperJobAuditListingFilters> = {},
): ScraperJobAuditListingFilters {
  return {
    duplicateDecision:
      input.duplicateDecision && (
        input.duplicateDecision === 'all' ||
        SCRAPER_DUPLICATE_DECISIONS.includes(input.duplicateDecision)
      )
        ? input.duplicateDecision
        : 'all',
    detailStatus:
      input.detailStatus && (
        input.detailStatus === 'all' ||
        SCRAPER_DETAIL_STATUSES.includes(input.detailStatus)
      )
        ? input.detailStatus
        : 'all',
    persistenceStatus:
      input.persistenceStatus && (
        input.persistenceStatus === 'all' ||
        SCRAPER_PERSISTENCE_STATUSES.includes(input.persistenceStatus)
      )
        ? input.persistenceStatus
        : 'all',
    weakFingerprintOnly: Boolean(input.weakFingerprintOnly),
    errorsOnly: Boolean(input.errorsOnly),
    page: Math.max(1, input.page ?? 1),
    pageSize: Math.min(100, Math.max(1, input.pageSize ?? 25)),
  }
}

export async function getCrawlJobAuditDetail(
  event: H3Event,
  params: {
    jobId: number
    filters?: Partial<ScraperJobAuditListingFilters>
  },
): Promise<ScraperJobAuditDetail> {
  const db = useAppDatabase(event)
  const filters = buildDefaultJobAuditFilters(params.filters)
  const job = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.id, params.jobId))
    .limit(1)
    .get()
  const eventsRows = await db
    .select()
    .from(crawlJobEvents)
    .where(eq(crawlJobEvents.crawlJobId, params.jobId))
    .orderBy(asc(crawlJobEvents.createdAt), asc(crawlJobEvents.id))
    .all()
  const overviewRow = await db
    .select({
      totalListings: sql<number>`COUNT(*)`,
      duplicateSkipped: sql<number>`SUM(CASE WHEN ${crawlJobListings.duplicateDecision} = 'known_duplicate_skipped' THEN 1 ELSE 0 END)`,
      weakRefreshes: sql<number>`SUM(CASE WHEN ${crawlJobListings.duplicateDecision} = 'weak_existing_refresh' THEN 1 ELSE 0 END)`,
      retriesQueued: sql<number>`SUM(CASE WHEN ${crawlJobListings.retryQueued} = 1 THEN 1 ELSE 0 END)`,
      retriesCompleted: sql<number>`SUM(CASE WHEN ${crawlJobListings.detailStatus} = 'retry_scraped' THEN 1 ELSE 0 END)`,
      persistenceFailed: sql<number>`SUM(CASE WHEN ${crawlJobListings.persistenceStatus} = 'failed' THEN 1 ELSE 0 END)`,
      detailFailed: sql<number>`SUM(CASE WHEN ${crawlJobListings.detailStatus} = 'failed' THEN 1 ELSE 0 END)`,
      stoppedListings: sql<number>`SUM(CASE WHEN ${crawlJobListings.detailStatus} = 'stopped' THEN 1 ELSE 0 END)`,
      weakFingerprintListings: sql<number>`SUM(CASE WHEN ${crawlJobListings.weakFingerprint} = 1 THEN 1 ELSE 0 END)`,
    })
    .from(crawlJobListings)
    .where(eq(crawlJobListings.crawlJobId, params.jobId))
    .get()
  const conditions = [eq(crawlJobListings.crawlJobId, params.jobId)]

  if (filters.duplicateDecision !== 'all') {
    conditions.push(eq(crawlJobListings.duplicateDecision, filters.duplicateDecision))
  }

  if (filters.detailStatus !== 'all') {
    conditions.push(eq(crawlJobListings.detailStatus, filters.detailStatus))
  }

  if (filters.persistenceStatus !== 'all') {
    conditions.push(eq(crawlJobListings.persistenceStatus, filters.persistenceStatus))
  }

  if (filters.weakFingerprintOnly) {
    conditions.push(eq(crawlJobListings.weakFingerprint, true))
  }

  if (filters.errorsOnly) {
    conditions.push(and(isNotNull(crawlJobListings.errorMessage), sql`${crawlJobListings.errorMessage} <> ''`)! )
  }

  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0]
  const totalRow = await db
    .select({ total: count() })
    .from(crawlJobListings)
    .where(whereClause)
    .get()
  const offset = (filters.page - 1) * filters.pageSize
  const listingRows = await db
    .select()
    .from(crawlJobListings)
    .where(whereClause)
    .orderBy(desc(crawlJobListings.lastUpdatedAt), desc(crawlJobListings.id))
    .limit(filters.pageSize)
    .offset(offset)
    .all()
  const total = totalRow?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize))
  const overview: ScraperJobAuditOverview = {
    totalListings: overviewRow?.totalListings ?? 0,
    duplicateSkipped: overviewRow?.duplicateSkipped ?? 0,
    weakRefreshes: overviewRow?.weakRefreshes ?? 0,
    retriesQueued: overviewRow?.retriesQueued ?? 0,
    retriesCompleted: overviewRow?.retriesCompleted ?? 0,
    persistenceFailed: overviewRow?.persistenceFailed ?? 0,
    detailFailed: overviewRow?.detailFailed ?? 0,
    stoppedListings: overviewRow?.stoppedListings ?? 0,
    weakFingerprintListings: overviewRow?.weakFingerprintListings ?? 0,
  }

  return {
    job: job
      ? {
          id: job.id,
          status: job.status,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          boatsFound: job.boatsFound,
          boatsScraped: job.boatsScraped,
          pagesVisited: job.pagesVisited,
          error: job.error,
          summary: parseJsonRecord(job.resultJson) as ScraperRunSummary | null,
        }
      : null,
    events: eventsRows.map(
      (row): ScraperJobAuditEvent => ({
        id: row.id,
        crawlJobId: row.crawlJobId,
        eventType: row.eventType as ScraperCrawlJobEventType,
        status: row.status,
        message: row.message,
        pageNumber: row.pageNumber,
        searchUrl: row.searchUrl,
        payload: parseJsonRecord(row.payloadJson),
        createdAt: row.createdAt,
      }),
    ),
    overview,
    listings: {
      items: listingRows.map((row) => toAuditListing(row)),
      total,
      page: Math.min(filters.page, pageCount),
      pageSize: filters.pageSize,
      pageCount,
    },
    filters,
  }
}

export async function persistScraperBrowserRecord(
  event: H3Event,
  params: {
    draft: ScraperPipelineDraft
    record: ScraperBrowserRunRecord
  },
) {
  const candidate = fromBrowserRunRecord(params.record, params.draft.boatSource)
  const persisted = await upsertBoatSourceListing(event, toBoatInsertValues(candidate, new Date().toISOString()))

  return {
    candidate,
    boatId: persisted.boatId,
    persistenceStatus: resolvePersistenceStatus(persisted),
    imagesUploaded: 0,
    inserted: persisted.inserted,
    updated: persisted.updated,
  }
}

export async function createRunningCrawlJob(
  event: H3Event,
  params: {
    pipelineId: number
    pipelineName: string
    searchUrl: string
    runMode: string
    startedAt: string
  },
) {
  const db = useAppDatabase(event)
  const initialSummary = {
    pagesVisited: 0,
    itemsSeen: 0,
    itemsExtracted: 0,
    skippedExisting: 0,
    inserted: 0,
    updated: 0,
    visitedUrls: [],
    warnings: [],
    records: [],
  } satisfies ScraperRunSummary
  await pruneExpiredCrawlJobAudit(event)

  await db
    .insert(crawlJobs)
    .values({
      pipelineId: params.pipelineId,
      pipelineName: params.pipelineName,
      searchUrl: params.searchUrl,
      runMode: params.runMode,
      status: 'running',
      boatsFound: 0,
      boatsScraped: 0,
      pagesVisited: 0,
      startedAt: params.startedAt,
      completedAt: null,
      error: null,
      resultJson: JSON.stringify(initialSummary),
    })
    .run()

  const job = await db
    .select({ id: crawlJobs.id })
    .from(crawlJobs)
    .where(eq(crawlJobs.startedAt, params.startedAt))
    .orderBy(desc(crawlJobs.id))
    .limit(1)
    .get()

  if (!job) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not create a crawl job for the extension scrape.',
    })
  }

  await appendCrawlJobEvent(event, {
    jobId: job.id,
    eventType: 'started',
    status: 'running',
    searchUrl: params.searchUrl,
    payload: coerceJsonRecord(initialSummary),
    createdAt: params.startedAt,
  })

  return job.id
}

export async function completeScraperPipelineJob(
  event: H3Event,
  params: {
    pipelineId: number
    jobId: number
    draft: ScraperPipelineDraft
    summary: ScraperBrowserRunSummary
    inserted: number
    updated: number
  },
) {
  const db = useAppDatabase(event)
  const completedAt = new Date().toISOString()
  await rebuildBoatDedupeState(event)
  const finalSummary = toFinalRunSummary(params.summary, [], params.inserted, params.updated)

  await db
    .update(crawlJobs)
    .set({
      status: 'completed',
      boatsFound: finalSummary.itemsSeen,
      boatsScraped: finalSummary.itemsExtracted,
      pagesVisited: finalSummary.pagesVisited,
      completedAt,
      error: null,
      resultJson: JSON.stringify(finalSummary),
    })
    .where(eq(crawlJobs.id, params.jobId))
    .run()

  await appendCrawlJobEvent(event, {
    jobId: params.jobId,
    eventType: 'completed',
    status: 'completed',
    payload: coerceJsonRecord(finalSummary),
    createdAt: completedAt,
  })

  await markScraperPipelineRun(event, params.pipelineId, completedAt)

  return {
    jobId: params.jobId,
    summary: finalSummary,
  }
}

export async function storeRunningScraperPipelineJobProgress(
  event: H3Event,
  params: {
    jobId: number
    summary: ScraperBrowserRunSummary
    progress: ScraperBrowserRunProgress
    inserted: number
    updated: number
    eventType?: 'progress' | 'detail_retry_started' | 'detail_retry_finished'
    message?: string | null
    pageNumber?: number | null
    searchUrl?: string | null
  },
) {
  const db = useAppDatabase(event)
  const partialSummary = toFinalRunSummary(params.summary, [], params.inserted, params.updated)
  const payload = coerceJsonRecord({
    ...partialSummary,
    progress: params.progress,
  })

  await db
    .update(crawlJobs)
    .set({
      status: 'running',
      boatsFound: partialSummary.itemsSeen,
      boatsScraped: params.progress.recordsPersisted,
      pagesVisited: partialSummary.pagesVisited,
      completedAt: null,
      error: null,
      resultJson: JSON.stringify(payload),
    })
    .where(eq(crawlJobs.id, params.jobId))
    .run()

  await appendCrawlJobEvent(event, {
    jobId: params.jobId,
    eventType: params.eventType ?? 'progress',
    status: 'running',
    message: params.message ?? null,
    pageNumber: params.pageNumber ?? null,
    searchUrl: params.searchUrl ?? params.progress.currentUrl ?? null,
    payload,
  })

  return {
    jobId: params.jobId,
    summary: partialSummary,
  }
}

export async function failScraperPipelineJob(
  event: H3Event,
  params: {
    jobId: number
    summary: ScraperBrowserRunSummary
    inserted: number
    updated: number
    error: string
    stopped?: boolean
  },
) {
  const db = useAppDatabase(event)
  const completedAt = new Date().toISOString()
  await rebuildBoatDedupeState(event)
  const finalSummary = toFinalRunSummary(params.summary, [], params.inserted, params.updated)
  const stopped = params.stopped ?? /stopped by user/i.test(params.error)

  await db
    .update(crawlJobs)
    .set({
      status: stopped ? 'stopped' : 'failed',
      boatsFound: finalSummary.itemsSeen,
      boatsScraped: finalSummary.itemsExtracted,
      pagesVisited: finalSummary.pagesVisited,
      completedAt,
      error: params.error,
      resultJson: JSON.stringify(finalSummary),
    })
    .where(eq(crawlJobs.id, params.jobId))
    .run()

  if (stopped) {
    await markPendingCrawlJobListingsStopped(event, {
      jobId: params.jobId,
      message: params.error,
    })
  }

  await appendCrawlJobEvent(event, {
    jobId: params.jobId,
    eventType: stopped ? 'stopped' : 'failed',
    status: stopped ? 'stopped' : 'failed',
    message: params.error,
    payload: coerceJsonRecord(finalSummary),
    createdAt: completedAt,
  })

  return {
    jobId: params.jobId,
    summary: finalSummary,
  }
}

async function recordCrawlJob(
  event: H3Event,
  params: {
    pipelineId: number
    pipelineName: string
    searchUrl: string
    status: string
    startedAt: string
    completedAt: string
    pagesVisited: number
    boatsFound: number
    boatsScraped: number
    summary: ScraperRunSummary | null
    error: string | null
  },
) {
  const db = useAppDatabase(event)
  await db
    .insert(crawlJobs)
    .values({
      pipelineId: params.pipelineId,
      pipelineName: params.pipelineName,
      searchUrl: params.searchUrl,
      runMode: 'manual',
      status: params.status,
      boatsFound: params.boatsFound,
      boatsScraped: params.boatsScraped,
      pagesVisited: params.pagesVisited,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      error: params.error,
      resultJson: params.summary ? JSON.stringify(params.summary) : null,
    })
    .run()

  const job = await db
    .select({ id: crawlJobs.id })
    .from(crawlJobs)
    .where(eq(crawlJobs.startedAt, params.startedAt))
    .orderBy(desc(crawlJobs.id))
    .limit(1)
    .get()

  return job?.id ?? null
}

export async function ingestScraperPipelineRun(
  event: H3Event,
  params: {
    pipelineId: number
    draft: ScraperPipelineDraft
    records: ScraperBrowserRunRecord[]
    summary: ScraperBrowserRunSummary
    startedAt?: string
  },
) {
  const startedAt = params.startedAt || new Date().toISOString()

  try {
    const candidates = params.records.map((record) =>
      fromBrowserRunRecord(record, params.draft.boatSource),
    )
    const persisted = await persistCandidates(event, candidates)
    const completedAt = new Date().toISOString()
    const finalSummary = toFinalRunSummary(
      params.summary,
      candidates,
      persisted.inserted,
      persisted.updated,
    )

    const jobId = await recordCrawlJob(event, {
      pipelineId: params.pipelineId,
      pipelineName: params.draft.name,
      searchUrl: params.draft.config.startUrls.join('\n'),
      status: 'completed',
      startedAt,
      completedAt,
      pagesVisited: finalSummary.pagesVisited,
      boatsFound: finalSummary.itemsSeen,
      boatsScraped: finalSummary.itemsExtracted,
      summary: finalSummary,
      error: null,
    })

    await markScraperPipelineRun(event, params.pipelineId, completedAt)

    return {
      jobId,
      summary: finalSummary,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'The scraper pipeline failed before completion.'

    await recordCrawlJob(event, {
      pipelineId: params.pipelineId,
      pipelineName: params.draft.name,
      searchUrl: params.draft.config.startUrls.join('\n'),
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      pagesVisited: params.summary.pagesVisited,
      boatsFound: params.summary.itemsSeen,
      boatsScraped: params.summary.itemsExtracted,
      summary: null,
      error: message,
    })

    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
}

export async function previewScraperPipeline(draft: ScraperPipelineDraft) {
  const { summary } = await executeScraperPipeline(draft)
  return summary
}

export async function runScraperPipeline(
  event: H3Event,
  params: {
    pipelineId: number
    draft: ScraperPipelineDraft
  },
) {
  const startedAt = new Date().toISOString()

  try {
    const { draft, summary } = await executeScraperPipeline(params.draft)
    return await ingestScraperPipelineRun(event, {
      pipelineId: params.pipelineId,
      draft,
      records: summary.records as ScraperBrowserRunRecord[],
      summary,
      startedAt,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'The scraper pipeline failed before completion.'

    await recordCrawlJob(event, {
      pipelineId: params.pipelineId,
      pipelineName: params.draft.name,
      searchUrl: params.draft.config.startUrls.join('\n'),
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      pagesVisited: 0,
      boatsFound: 0,
      boatsScraped: 0,
      summary: null,
      error: message,
    })

    throw createError({
      statusCode: 500,
      statusMessage: message,
    })
  }
}
