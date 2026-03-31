import { describe, expect, it } from 'vitest'
import {
  createEmptyScraperPipelineDraft,
  isYachtWorldDetailBackfillUrl,
  multilineToList,
  scraperBrowserRunListingAuditSchema,
  scraperBrowserRunRecordSchema,
  scraperPipelineDraftSchema,
} from '../../lib/scraperPipeline'

describe('scraper pipeline draft schema', () => {
  it('rejects configs without a URL rule', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Test pipeline'
    draft.boatSource = 'boats.com'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.fields = draft.config.fields.filter((field) => field.key !== 'url')

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('requires detail fetching when a field targets detail scope', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Test pipeline'
    draft.boatSource = 'boats.com'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.fetchDetailPages = false

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('requires a follow-page selector when a field targets detail-follow scope', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Photo backfill pipeline'
    draft.boatSource = 'YachtWorld'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.detailFollowLinkSelector = ''
    draft.config.fields.push({
      key: 'images',
      scope: 'detail-follow',
      selector: 'img',
      extract: 'attr',
      attribute: 'src',
      multiple: true,
      joinWith: '\n',
      transform: 'url',
      regex: '',
      required: false,
    })

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('accepts crawl limits above the legacy 25-page ceiling', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Large crawl pipeline'
    draft.boatSource = 'boats.com'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.maxPages = 120
    draft.config.maxItemsPerRun = 1000

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.config.maxPages).toBe(120)
    expect(parsed.data?.config.maxItemsPerRun).toBe(1000)
  })

  it('normalizes line-separated values for textarea inputs', () => {
    expect(multilineToList(' example.com \n\n boats.com \n')).toEqual(['example.com', 'boats.com'])
  })

  it('recognizes YachtWorld listing detail URLs for backfill mode', () => {
    expect(
      isYachtWorldDetailBackfillUrl('https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/'),
    ).toBe(true)
    expect(isYachtWorldDetailBackfillUrl('https://yachtworld.com/yacht/foo-123456/')).toBe(true)
    expect(isYachtWorldDetailBackfillUrl('https://www.yachtworld.com/boats-for-sale/')).toBe(false)
    expect(isYachtWorldDetailBackfillUrl('https://www.boats.com/foo')).toBe(false)
  })

  it('accepts YachtWorld detail backfill draft when URLs and boat source match', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'YW backfill'
    draft.boatSource = 'YachtWorld'
    draft.config.detailBackfillMode = true
    draft.config.fetchDetailPages = true
    draft.config.startUrls = ['https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/']
    draft.config.itemSelector = '.grid-item'

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(true)
    expect(parsed.data?.config.detailBackfillMode).toBe(true)
  })

  it('rejects detail backfill when boat source is not YachtWorld', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Bad backfill'
    draft.boatSource = 'boats.com'
    draft.config.detailBackfillMode = true
    draft.config.fetchDetailPages = true
    draft.config.startUrls = ['https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/']
    draft.config.itemSelector = '.listing'

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('rejects detail backfill when a start URL is not a YachtWorld detail link', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'YW backfill'
    draft.boatSource = 'YachtWorld'
    draft.config.detailBackfillMode = true
    draft.config.fetchDetailPages = true
    draft.config.startUrls = ['https://www.yachtworld.com/boats-for-sale/']
    draft.config.itemSelector = '.grid-item'

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('rejects detail backfill when detail fetching is disabled', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'YW backfill'
    draft.boatSource = 'YachtWorld'
    draft.config.detailBackfillMode = true
    draft.config.fetchDetailPages = false
    draft.config.startUrls = ['https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/']
    draft.config.itemSelector = '.grid-item'

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('accepts structured extension records with stored and source image references', () => {
    const parsed = scraperBrowserRunRecordSchema.parse({
      source: 'YachtWorld',
      url: 'https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/',
      listingId: '10019034',
      title: '2021 Pathfinder 2500 Hybrid',
      make: 'Pathfinder',
      model: '2500 Hybrid',
      year: 2021,
      length: '25 ft',
      price: '149900',
      currency: 'USD',
      location: 'Texas City, Texas',
      city: 'Texas City',
      state: 'Texas',
      country: null,
      description: 'Low hours.',
      contactInfo: 'Please contact Matt Nader at 772-610-4565',
      engineMake: 'Yamaha',
      engineHours: '119',
      fuelTank: '67 gal',
      sellerType: 'dealer',
      listingType: 'used',
      images: ['/images/uploads/scraped/example.jpg'],
      sourceImages: ['https://images.boats.com/example.jpg'],
      fullText: 'Boat details text',
      rawFields: {
        images: ['https://images.boats.com/example.jpg'],
      },
      warnings: [],
    })

    expect(parsed.images).toEqual(['/images/uploads/scraped/example.jpg'])
    expect(parsed.sourceImages).toEqual(['https://images.boats.com/example.jpg'])
    expect(parsed.contactInfo).toContain('Matt Nader')
    expect(parsed.engineMake).toBe('Yamaha')
    expect(parsed.fuelTank).toBe('67 gal')
  })

  it('accepts listing-level browser run audit payloads', () => {
    const parsed = scraperBrowserRunListingAuditSchema.parse({
      runId: 22,
      identityKey: 'https://www.yachtworld.com/yacht/2024-mastercraft-x24-9617758/',
      source: 'YachtWorld',
      listingId: '9617758',
      listingUrl: 'https://www.yachtworld.com/yacht/2024-mastercraft-x24-9617758/',
      detailUrl: 'https://www.yachtworld.com/yacht/2024-mastercraft-x24-9617758/',
      pageNumber: 3,
      duplicateDecision: 'weak_existing_refresh',
      detailStatus: 'retry_queued',
      detailAttempts: 1,
      retryQueued: true,
      weakFingerprint: true,
      finalImageCount: 1,
      finalHasStructuredDetails: false,
      error: null,
      warnings: ['Weak detail fingerprint detected'],
      auditJson: {
        stage: 'detail',
        pageUrl: 'https://www.yachtworld.com/boats-for-sale/page-3/',
      },
    })

    expect(parsed.detailStatus).toBe('retry_queued')
    expect(parsed.retryQueued).toBe(true)
    expect(parsed.auditJson.pageUrl).toBe('https://www.yachtworld.com/boats-for-sale/page-3/')
  })
})
