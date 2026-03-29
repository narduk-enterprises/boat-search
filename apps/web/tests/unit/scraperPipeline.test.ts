import { describe, expect, it } from 'vitest'
import {
  createEmptyScraperPipelineDraft,
  multilineToList,
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
})
