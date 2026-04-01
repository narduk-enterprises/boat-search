import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScraperBrowserRunRecord, ScraperPipelineDraft } from '../../lib/scraperPipeline'

const upsertBoatSourceListing = vi.fn()
const rebuildBoatDedupeState = vi.fn()
const uploadToR2 = vi.fn()

vi.mock('#server/utils/boatDedupe', () => ({
  rebuildBoatDedupeState,
  upsertBoatSourceListing,
}))

vi.mock('#layer/server/utils/r2', () => ({
  uploadToR2,
}))

let persistScraperBrowserRecord: typeof import('../../server/utils/scraperPipelineEngine').persistScraperBrowserRecord

function createDraft(): ScraperPipelineDraft {
  return {
    name: 'YachtWorld Pipeline',
    boatSource: 'YachtWorld',
    description: '',
    active: true,
    config: {
      startUrls: [
        'https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/price-100000,500000/?',
      ],
      allowedDomains: ['www.yachtworld.com', 'images.yachtworld.com'],
      itemSelector: 'div.grid-item',
      nextPageSelector: 'a[rel="next"]',
      detailFollowLinkSelector: '',
      maxPages: 1,
      maxItemsPerRun: 50,
      fetchDetailPages: true,
      detailBackfillMode: false,
      fields: [],
    },
  }
}

function createBrowserRecord(): ScraperBrowserRunRecord {
  return {
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
    country: 'US',
    description: 'Low hours.',
    contactInfo: null,
    contactName: null,
    contactPhone: null,
    otherDetails: null,
    disclaimer: null,
    features: null,
    electricalEquipment: null,
    electronics: null,
    insideEquipment: null,
    outsideEquipment: null,
    additionalEquipment: null,
    propulsion: null,
    engineMake: null,
    engineModel: null,
    engineYearDetail: null,
    totalPower: null,
    engineHours: null,
    engineTypeDetail: null,
    driveType: null,
    fuelTypeDetail: null,
    propellerType: null,
    propellerMaterial: null,
    specifications: null,
    cruisingSpeed: null,
    maxSpeed: null,
    range: null,
    lengthOverall: null,
    maxBridgeClearance: null,
    maxDraft: null,
    minDraftDetail: null,
    beamDetail: null,
    dryWeight: null,
    windlass: null,
    electricalCircuit: null,
    deadriseAtTransom: null,
    hullMaterial: null,
    hullShape: null,
    keelType: null,
    freshWaterTank: null,
    fuelTank: null,
    holdingTank: null,
    guestHeads: null,
    sellerType: 'dealer',
    listingType: 'used',
    images: [
      'https://images.yachtworld.com/example-1.jpg',
      'https://images.yachtworld.com/example-1.jpg',
      'https://images.yachtworld.com/example-2.jpg',
    ],
    sourceImages: [],
    fullText: 'Boat details text',
    rawFields: {
      images: [
        'https://images.yachtworld.com/example-1.jpg',
        'https://images.yachtworld.com/example-2.jpg',
      ],
    },
    warnings: [],
  }
}

describe('persistScraperBrowserRecord', () => {
  beforeAll(async () => {
    const scraperPipelineEngine = await import('../../server/utils/scraperPipelineEngine')
    persistScraperBrowserRecord = scraperPipelineEngine.persistScraperBrowserRecord
  })

  beforeEach(() => {
    upsertBoatSourceListing.mockReset()
    rebuildBoatDedupeState.mockReset()
    uploadToR2.mockReset()
    upsertBoatSourceListing.mockResolvedValue({ boatId: 101, inserted: 1, updated: 0 })
    uploadToR2.mockResolvedValue('artifacts/detail-pages/yachtworld/listing-10019034-latest.json')
  })

  it('stores raw image urls in both images fields and reports zero uploads', async () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            BUCKET: {},
          },
        },
      },
    } as never

    const result = await persistScraperBrowserRecord(event, {
      draft: createDraft(),
      record: createBrowserRecord(),
    })

    expect(upsertBoatSourceListing).toHaveBeenCalledTimes(1)
    expect(upsertBoatSourceListing).toHaveBeenCalledWith(
      event,
      expect.objectContaining({
        needsRescrape: 0,
        images: JSON.stringify([
          'https://images.yachtworld.com/example-1.jpg',
          'https://images.yachtworld.com/example-2.jpg',
        ]),
        sourceImages: JSON.stringify([
          'https://images.yachtworld.com/example-1.jpg',
          'https://images.yachtworld.com/example-2.jpg',
        ]),
      }),
    )
    expect(rebuildBoatDedupeState).not.toHaveBeenCalled()
    expect(result.imagesUploaded).toBe(0)
    expect(result.boatId).toBe(101)
    expect(result.persistenceStatus).toBe('inserted')
    expect(result.candidate.images).toEqual([
      'https://images.yachtworld.com/example-1.jpg',
      'https://images.yachtworld.com/example-2.jpg',
    ])
    expect(result.candidate.sourceImages).toEqual([
      'https://images.yachtworld.com/example-1.jpg',
      'https://images.yachtworld.com/example-2.jpg',
    ])
  })

  it('stores the combined detail artifact in R2 under versioned and latest keys', async () => {
    const event = {
      context: {
        cloudflare: {
          env: {
            BUCKET: {},
          },
        },
      },
    } as never

    const result = await persistScraperBrowserRecord(event, {
      draft: createDraft(),
      record: createBrowserRecord(),
      detailArtifact: {
        capturedAt: '2026-03-31T18:45:12.000Z',
        pages: [
          {
            role: 'detail',
            html: '<!doctype html><html><body><main>Detail</main></body></html>',
            analysis: {
              pageType: 'detail',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: 'https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/',
              itemSelector: '',
              nextPageSelector: '',
              sampleDetailUrl: null,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 0,
                listingCardCount: 0,
                distinctImageCount: 4,
              },
            },
            page: {
              url: 'https://www.yachtworld.com/yacht/2021-pathfinder-2500-hybrid-10019034/',
              title: '2021 Pathfinder 2500 Hybrid',
              readyState: 'complete',
              viewport: {
                width: 1600,
                height: 1200,
                scrollX: 0,
                scrollY: 0,
                scrollWidth: 1600,
                scrollHeight: 2400,
                clientWidth: 1600,
                clientHeight: 1200,
              },
            },
          },
        ],
      },
    })

    expect(uploadToR2).toHaveBeenCalledTimes(2)
    expect(uploadToR2).toHaveBeenNthCalledWith(
      1,
      event,
      expect.stringMatching(
        /^artifacts\/detail-pages\/yachtworld\/listing-10019034-[a-f0-9]{12}\/20260331T184512000Z\.json$/,
      ),
      expect.stringContaining('"listingId":"10019034"'),
      'application/json;charset=utf-8',
    )
    expect(uploadToR2).toHaveBeenNthCalledWith(
      2,
      event,
      expect.stringMatching(
        /^artifacts\/detail-pages\/yachtworld\/listing-10019034-[a-f0-9]{12}\/latest\.json$/,
      ),
      expect.stringContaining('"role":"detail"'),
      'application/json;charset=utf-8',
    )
    expect(result.detailArtifact).toEqual(
      expect.objectContaining({
        pageCount: 1,
        latestKey: expect.stringMatching(/\/latest\.json$/),
        versionKey: expect.stringMatching(/20260331T184512000Z\.json$/),
      }),
    )
  })
})
