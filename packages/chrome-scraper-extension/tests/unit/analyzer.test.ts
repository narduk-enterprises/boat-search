import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { buildPresetDraft } from '@/shared/sitePresets'
import {
  analyzeDocument,
  extractDetailPageDocument,
  extractSearchPageDocument,
} from '@/content/analyzer'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readFixture(...segments: string[]) {
  return readFileSync(resolve(__dirname, '..', '..', ...segments), 'utf8')
}

function createDocument(html: string, url: string) {
  return new JSDOM(html, { url }).window.document
}

describe('extension DOM analyzer', () => {
  it('detects repeated listing cards, sample detail links, and pagination on YachtWorld search fixtures', () => {
    const html = readFixture(
      '..',
      'boat-crawler',
      'tests',
      'fixtures',
      'yachtworld',
      'search-ok.html',
    )
    const document = createDocument(
      html,
      'https://www.yachtworld.com/boats-for-sale/type-power/class-sportfish-convertible/',
    )

    const analysis = analyzeDocument(document, document.location.href)

    expect(analysis.pageType).toBe('search')
    expect(analysis.pageState).toBe('ok')
    expect(analysis.itemSelector).toBeTruthy()
    expect(analysis.sampleDetailUrl).toMatch(/^https:\/\/www\.yachtworld\.com\/yacht\//)
    expect(analysis.nextPageSelector).toBeTruthy()
    expect(analysis.stats.listingCardCount).toBeGreaterThanOrEqual(4)
    expect(analysis.stats.detailLinkCount).toBeGreaterThanOrEqual(4)

    const draft = buildPresetDraft('yachtworld-search', {
      pageUrl: document.location.href,
      analysis,
    })
    draft.config.maxItemsPerRun = 10

    const result = extractSearchPageDocument(document, document.location.href, {
      draft,
      presetId: 'yachtworld-search',
    })
    expect(result.itemCount).toBeGreaterThanOrEqual(4)
    expect(result.records.length).toBeGreaterThanOrEqual(4)
    expect(result.nextPageUrl).toContain('/page-2/')
    expect(result.records[0]).toMatchObject({
      source: 'YachtWorld',
      listingId: '1234567',
      year: 2005,
      make: 'Hatteras',
      model: '50 Convertible',
      currency: 'USD',
      city: 'Destin',
      state: 'Florida',
    })
  })

  it('returns an explicit challenge state for blocked YachtWorld fixtures', () => {
    const html = readFixture(
      '..',
      'boat-crawler',
      'tests',
      'fixtures',
      'yachtworld',
      'challenge.html',
    )
    const document = createDocument(
      html,
      'https://www.yachtworld.com/boats-for-sale/type-power/class-sportfish-convertible/',
    )

    const analysis = analyzeDocument(document, document.location.href)

    expect(analysis.pageType).toBe('search')
    expect(analysis.pageState).toBe('challenge')
    expect(analysis.stateMessage).toMatch(/challenge|cloudflare|verification/i)
  })

  it('detects multi-image detail galleries and extracts them into the detail record', () => {
    const html = readFixture('tests', 'fixtures', 'yachtworld', 'detail-ok.html')
    const document = createDocument(
      html,
      'https://www.yachtworld.com/yacht/viking-52-convertible-1234567/',
    )

    const analysis = analyzeDocument(document, document.location.href)

    expect(analysis.pageType).toBe('detail')
    expect(analysis.pageState).toBe('ok')
    expect(analysis.stats.distinctImageCount).toBeGreaterThanOrEqual(4)
    expect(analysis.fields.find((field) => field.key === 'images')?.selector).toBeTruthy()

    const draft = buildPresetDraft('yachtworld-search', {
      pageUrl: 'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
      analysis: null,
    })

    const result = extractDetailPageDocument(document, document.location.href, {
      draft,
      presetId: 'yachtworld-search',
    })
    expect(result.record.title).toContain('Viking 52 Convertible')
    expect(result.record.images).toHaveLength(4)
    expect(result.record.year).toBe(2008)
    expect(result.record.make).toBe('Viking')
    expect(result.record.model).toBe('52 Convertible')
    expect(result.record.currency).toBe('USD')
    expect(result.record.city).toBe('Orange Beach')
    expect(result.record.state).toBe('Alabama')
    expect(result.record.length).toBe('52 ft')
    expect(result.record.sellerType).toBe('broker')
    expect(result.record.listingType).toBe('used')
    expect(result.record.fullText).toContain('tournament-rigged sportfish')
    expect(result.record.country).toBeNull()
  })
})
