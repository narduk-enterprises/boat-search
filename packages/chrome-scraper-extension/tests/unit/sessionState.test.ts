import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@/content/analyzer'
import { createDefaultSession } from '@/shared/defaults'
import {
  applyAnalysisToSession,
  buildClearedScrapeSession,
  buildAnalysisStatusMessage,
  buildSessionWithoutConnection,
  collectBrowserDetailQueue,
  createSampleDetailRunState,
  isPaginationAutoDetected,
  shouldContinueBrowserSearchPagination,
  isTrustedPresetReady,
} from '@/sidepanel/state/sessionState'
import { buildPresetDraft } from '@/shared/sitePresets'
import type { BrowserScrapeRecord } from '@/shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readFixture(...segments: string[]) {
  return readFileSync(resolve(__dirname, '..', '..', ...segments), 'utf8')
}

function createDocument(html: string, url: string) {
  return new JSDOM(html, { url }).window.document
}

describe('sidepanel session state helpers', () => {
  it('applies search analysis and preserves auto-detected pagination state', () => {
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
    const session = createDefaultSession()

    applyAnalysisToSession(session, analysis)

    expect(session.draft.config.startUrls).toEqual([document.location.href])
    expect(session.sampleDetailUrl).toBe(analysis.sampleDetailUrl)
    expect(session.draft.config.nextPageSelector).toBe(analysis.nextPageSelector)
    expect(session.draft.config.itemSelector).toBe(analysis.itemSelector)
    expect(isPaginationAutoDetected(session)).toBe(true)
  })

  it('builds explicit challenge messages instead of ambiguous unknown-page messaging', () => {
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

    expect(buildAnalysisStatusMessage(analysis)).toMatch(/challenge|cloudflare|verification/i)
  })

  it('tracks sample-detail states from opening through a scanned result with image counts', () => {
    const opening = createSampleDetailRunState('opening', {
      url: 'https://www.yachtworld.com/yacht/viking-52-convertible-1234567/',
      message: 'Opening the sample detail page.',
    })
    const opened = createSampleDetailRunState('opened', {
      url: opening.url,
      message: 'The sample detail page finished loading.',
    })
    const scanned = createSampleDetailRunState('scanned', {
      url: opened.url,
      fieldCount: 5,
      imageCount: 4,
      message: 'Opened and auto-scanned the sample detail page.',
    })

    expect([opening.status, opened.status, scanned.status]).toEqual([
      'opening',
      'opened',
      'scanned',
    ])
    expect(scanned.fieldCount).toBe(5)
    expect(scanned.imageCount).toBe(4)
  })

  it('treats trusted presets as ready without a mandatory detail scan', () => {
    const session = createDefaultSession()
    session.preset.appliedPresetId = 'yachtworld-search'
    session.preset.appliedPresetLabel = 'YachtWorld Search'
    session.draft = buildPresetDraft('yachtworld-search', {
      pageUrl:
        'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
      analysis: null,
    })

    expect(isTrustedPresetReady(session)).toBe(true)
  })

  it('clears scrape state while preserving the saved Boat Search connection', () => {
    const session = createDefaultSession()
    session.appBaseUrl = 'https://boat-search.nard.uk'
    session.appBaseUrlSource = 'manual'
    session.connection.apiKey = 'nk_saved_manual'
    session.connection.apiKeySource = 'manual'
    session.connection.verifiedAt = '2026-03-29T10:00:00.000Z'
    session.connection.verifiedEmail = 'captain@example.com'
    session.connection.verifiedName = 'Captain'
    session.connection.imageUploadEnabled = true
    session.browserSettings.detailTabConcurrency = 3
    session.tabTarget.mode = 'locked'
    session.tabTarget.tabId = 17
    session.tabTarget.windowId = 3
    session.tabTarget.url =
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/'
    session.tabTarget.title = 'Locked YachtWorld results'
    session.currentTabUrl =
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/'
    session.sampleDetailUrl = 'https://www.yachtworld.com/yacht/test-1234567/'
    session.preset.appliedPresetId = 'yachtworld-search'
    session.preset.appliedPresetLabel = 'YachtWorld Search'
    session.preset.isDraftDirty = true
    session.lastAnalysis = {
      pageType: 'search',
      pageState: 'ok',
      stateMessage: null,
      siteName: 'YachtWorld',
      pageUrl: session.currentTabUrl,
      itemSelector: '.listing-card',
      nextPageSelector: '.pagination a.next',
      sampleDetailUrl: session.sampleDetailUrl,
      fields: [],
      warnings: [],
      stats: {
        detailLinkCount: 4,
        listingCardCount: 12,
        distinctImageCount: 9,
      },
    }
    session.draft.config.startUrls = [session.currentTabUrl]

    const cleared = buildClearedScrapeSession(session, createDefaultSession())

    expect(cleared.appBaseUrl).toBe('https://boat-search.nard.uk')
    expect(cleared.appBaseUrlSource).toBe('manual')
    expect(cleared.connection).toEqual(session.connection)
    expect(cleared.browserSettings).toEqual(session.browserSettings)
    expect(cleared.tabTarget).toEqual(session.tabTarget)
    expect(cleared.currentTabUrl).toBe(session.currentTabUrl)
    expect(cleared.lastAnalysis).toBeNull()
    expect(cleared.sampleDetailUrl).toBeNull()
    expect(cleared.preset.appliedPresetId).toBeNull()
    expect(cleared.preset.isDraftDirty).toBe(false)
    expect(cleared.draft.config.startUrls).toEqual([])
  })

  it('forgets the Boat Search connection without wiping the current scrape draft', () => {
    const session = createDefaultSession()
    session.appBaseUrl = 'https://boat-search.nard.uk'
    session.appBaseUrlSource = 'manual'
    session.connection.apiKey = 'nk_saved_manual'
    session.connection.apiKeySource = 'manual'
    session.connection.verifiedAt = '2026-03-29T10:00:00.000Z'
    session.connection.verifiedEmail = 'captain@example.com'
    session.connection.verifiedName = 'Captain'
    session.connection.imageUploadEnabled = true
    session.currentTabUrl =
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/'
    session.draft.name = 'Saved trusted preset'
    session.draft.config.startUrls = [session.currentTabUrl]
    session.preset.appliedPresetId = 'yachtworld-search'
    session.preset.appliedPresetLabel = 'YachtWorld Search'

    const forgotten = buildSessionWithoutConnection(session)

    expect(forgotten.appBaseUrl).toBe('')
    expect(forgotten.appBaseUrlSource).toBe('manual')
    expect(forgotten.connection).toEqual({
      apiKey: '',
      apiKeySource: 'manual',
      verifiedAt: null,
      verifiedEmail: null,
      verifiedName: null,
      imageUploadEnabled: false,
    })
    expect(forgotten.draft).toEqual(session.draft)
    expect(forgotten.preset).toEqual(session.preset)
    expect(forgotten.currentTabUrl).toBe(session.currentTabUrl)
  })

  it('keeps paging search results when detail scraping is enabled, even after the item cap is reached', () => {
    expect(
      shouldContinueBrowserSearchPagination({
        fetchDetailPages: true,
        searchRecordCount: 60,
        maxItemsPerRun: 60,
      }),
    ).toBe(true)

    expect(
      shouldContinueBrowserSearchPagination({
        fetchDetailPages: false,
        searchRecordCount: 60,
        maxItemsPerRun: 60,
      }),
    ).toBe(false)
  })

  it('builds the detail queue from every queued search record with a URL', () => {
    const records: BrowserScrapeRecord[] = [
      {
        source: 'YachtWorld',
        url: 'https://www.yachtworld.com/yacht/one-123/',
        listingId: '123',
        title: 'One',
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
      },
      {
        source: 'YachtWorld',
        url: null,
        listingId: '124',
        title: 'Two',
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
      },
      {
        source: 'YachtWorld',
        url: 'https://www.yachtworld.com/yacht/three-125/',
        listingId: '125',
        title: 'Three',
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
      },
    ]

    expect(collectBrowserDetailQueue(records).map((record) => record.listingId)).toEqual([
      '123',
      '125',
    ])
  })
})
