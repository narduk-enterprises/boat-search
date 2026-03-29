import { desc, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { load, type CheerioAPI } from 'cheerio'
import type {
  ScraperBrowserRunRecord,
  ScraperBrowserRunSummary,
  ScraperFieldRule,
  ScraperPipelineDraft,
  ScraperRunRecord,
  ScraperRunSummary,
} from '~~/lib/scraperPipeline'
import { scraperPipelineDraftSchema } from '~~/lib/scraperPipeline'
import { cleanBoatDescription } from '#server/utils/boatInventory'
import { useAppDatabase } from '#server/utils/database'
import { boats, crawlJobs } from '#server/database/schema'
import { markScraperPipelineRun } from '#server/utils/scraperPipelineStore'

type SelectorContext = ReturnType<CheerioAPI>

type ExtractedBoatCandidate = Omit<ScraperRunRecord, 'year'> & {
  source: string
  length: string | null
  currency: string | null
  city: string | null
  state: string | null
  country: string | null
  sellerType: string | null
  listingType: string | null
  fullText: string | null
  year: number | null
}

const FETCH_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (compatible; BoatSearchPipeline/1.0; +https://boat-search.nard.uk/admin/scraper-pipeline)',
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeWhitespace(value: string) {
  return value.replaceAll(/\s+/g, ' ').trim()
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
    title: null,
    listingId: null,
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
  candidate.sellerType = record.sellerType
  candidate.listingType = record.listingType
  candidate.images = record.images
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

  for (const field of itemFields) {
    assignFieldValue(candidate, field, readSelectionValues($page, item, field, pageUrl))
  }

  if (candidate.url && draft.config.fetchDetailPages && detailFields.length) {
    const $detail = await getDetailDocument(candidate.url, allowedDomains, detailCache)
    for (const field of detailFields) {
      assignFieldValue(
        candidate,
        field,
        readSelectionValues($detail, $detail.root(), field, candidate.url),
      )
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
    sellerType: candidate.sellerType,
    listingType: candidate.listingType,
    images: candidate.images.length ? JSON.stringify(candidate.images) : null,
    fullText: candidate.fullText,
    scrapedAt: now,
    updatedAt: now,
    searchLengthMin: null,
    searchLengthMax: null,
    searchType: null,
    searchLocation: null,
  }
}

async function persistCandidates(event: H3Event, candidates: ExtractedBoatCandidate[]) {
  const db = useAppDatabase(event)
  const uniqueCandidates = [
    ...new Map(
      candidates
        .filter((candidate): candidate is ExtractedBoatCandidate & { url: string } =>
          Boolean(candidate.url),
        )
        .map((candidate) => [candidate.url, candidate]),
    ).values(),
  ]
  const urls = uniqueCandidates.map((candidate) => candidate.url)
  const existingRows = urls.length
    ? await db.select({ id: boats.id, url: boats.url }).from(boats).where(inArray(boats.url, urls))
    : []
  const existingByUrl = new Map(existingRows.map((row) => [row.url, row]))
  let inserted = 0
  let updated = 0

  for (const candidate of uniqueCandidates) {
    const now = new Date().toISOString()
    const values = toBoatInsertValues(candidate, now)
    const existing = existingByUrl.get(candidate.url)

    if (existing) {
      await db.update(boats).set(values).where(eq(boats.id, existing.id)).run()
      updated += 1
      continue
    }

    await db.insert(boats).values(values).run()
    inserted += 1
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
    inserted,
    updated,
    visitedUrls: summary.visitedUrls,
    warnings: dedupeStrings([
      ...summary.warnings,
      ...candidates.flatMap((candidate) => candidate.warnings),
    ]),
    records: candidates as ScraperRunRecord[],
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
  const persisted = await persistCandidates(event, [candidate])

  return {
    candidate,
    ...persisted,
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
      resultJson: null,
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

  await markScraperPipelineRun(event, params.pipelineId, completedAt)

  return {
    jobId: params.jobId,
    summary: finalSummary,
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
  },
) {
  const db = useAppDatabase(event)
  const completedAt = new Date().toISOString()
  const finalSummary = toFinalRunSummary(params.summary, [], params.inserted, params.updated)

  await db
    .update(crawlJobs)
    .set({
      status: 'failed',
      boatsFound: finalSummary.itemsSeen,
      boatsScraped: finalSummary.itemsExtracted,
      pagesVisited: finalSummary.pagesVisited,
      completedAt,
      error: params.error,
      resultJson: JSON.stringify(finalSummary),
    })
    .where(eq(crawlJobs.id, params.jobId))
    .run()

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
