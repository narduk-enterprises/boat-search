import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { buildPresetDraft } from '@/shared/sitePresets'
import {
  analyzeDocument,
  capturePageDocument,
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
  it('detects repeated listing cards, sample detail links, and pagination on Boats.com search fixtures', () => {
    const html = readFixture('tests', 'fixtures', 'boats-com', 'search-ok.html')
    const document = createDocument(
      html,
      'https://www.boats.com/boats-for-sale/?condition=used&boat-type=power&class=power-saltfish&price=100000-200000&distance=100&postal-code=77388',
    )

    const analysis = analyzeDocument(document, document.location.href)

    expect(analysis.pageType).toBe('search')
    expect(analysis.pageState).toBe('ok')
    expect(analysis.itemSelector).toBe('li[data-listing-id]')
    expect(analysis.sampleDetailUrl).toMatch(/^https:\/\/www\.boats\.com\/power-boats\//)
    expect(analysis.nextPageSelector).toBeTruthy()
    expect(analysis.stats.listingCardCount).toBeGreaterThanOrEqual(4)
    expect(analysis.stats.detailLinkCount).toBeGreaterThanOrEqual(4)

    const draft = buildPresetDraft('boats-com-search', {
      pageUrl: document.location.href,
      analysis,
    })
    draft.config.maxItemsPerRun = 10

    const result = extractSearchPageDocument(document, document.location.href, {
      draft,
      presetId: 'boats-com-search',
    })

    expect(result.itemCount).toBeGreaterThanOrEqual(4)
    expect(result.records.length).toBeGreaterThanOrEqual(4)
    expect(result.nextPageUrl).toContain('page=2')
    expect(result.records[0]).toMatchObject({
      source: 'Boats.com',
      listingId: '10066742',
      title: 'Pathfinder 2700 Open',
      year: 2023,
      make: 'Pathfinder',
      model: '2700 Open',
      currency: 'USD',
      city: 'Kemah',
      state: 'Texas',
      price: '155000',
    })
  })

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

  it('captures serialized page HTML, metadata, and a fresh analysis snapshot', () => {
    const html = readFixture('tests', 'fixtures', 'yachtworld', 'detail-ok.html')
    const document = createDocument(
      html,
      'https://www.yachtworld.com/yacht/viking-52-convertible-1234567/',
    )

    const capture = capturePageDocument(document, document.location.href)

    expect(capture.html).toContain('<!DOCTYPE html>')
    expect(capture.html).toContain('Viking 52 Convertible')
    expect(capture.page.url).toBe(document.location.href)
    expect(capture.page.title).toBe(document.title)
    expect(capture.page.readyState).toBeTruthy()
    expect(capture.analysis.pageType).toBe('detail')
    expect(capture.analysis.pageState).toBe('ok')
  })

  it('extracts Boats.com detail records with normalized title, location, and images', () => {
    const html = readFixture('tests', 'fixtures', 'boats-com', 'detail-ok.html')
    const document = createDocument(
      html,
      'https://www.boats.com/power-boats/2023-pathfinder-2700-open-10066742/',
    )

    const analysis = analyzeDocument(document, document.location.href)

    expect(analysis.pageType).toBe('detail')
    expect(analysis.pageState).toBe('ok')
    expect(analysis.stats.distinctImageCount).toBeGreaterThanOrEqual(8)
    expect(analysis.fields.find((field) => field.key === 'images')?.selector).toBeTruthy()

    const draft = buildPresetDraft('boats-com-search', {
      pageUrl:
        'https://www.boats.com/boats-for-sale/?condition=used&boat-type=power&class=power-saltfish&price=100000-200000&distance=100&postal-code=77388',
      analysis: null,
    })

    const result = extractDetailPageDocument(document, document.location.href, {
      draft,
      presetId: 'boats-com-search',
    })

    expect(result.record).toMatchObject({
      listingId: '10066742',
      title: 'Pathfinder 2700 Open',
      year: 2023,
      make: 'Pathfinder',
      model: '2700 Open',
      currency: 'USD',
      city: 'Kemah',
      state: 'Texas',
      country: 'US',
      location: 'Kemah, Texas',
      length: '27 ft',
      price: '155000',
    })
    expect(result.record.images?.length).toBeGreaterThanOrEqual(8)
    expect(result.record.fullText).toContain('Pathfinder 2700 Open')
  })
})
