import { describe, expect, it } from 'vitest'
import {
  buildFixtureCaptureFileNames,
  buildFixtureCaptureFileStem,
  buildFixtureCaptureMetadata,
  createDefaultFixtureCaptureSessionState,
  evaluateFixtureCaptureTemplate,
  normalizeFixtureCaptureSessionState,
  resolveFixtureLabel,
} from '@/shared/fixtureCapture'
import type { AutoDetectedAnalysis } from '@/shared/types'

function createAnalysis(
  overrides: Partial<AutoDetectedAnalysis> = {},
): AutoDetectedAnalysis {
  return {
    pageType: 'search',
    pageState: 'ok',
    stateMessage: null,
    siteName: 'boats.com',
    pageUrl: 'https://www.boats.com/boats-for-sale/',
    itemSelector: 'article',
    nextPageSelector: 'a[rel="next"]',
    sampleDetailUrl: 'https://www.boats.com/power-boats/example-123/',
    fields: [],
    warnings: [],
    stats: {
      detailLinkCount: 12,
      listingCardCount: 12,
      distinctImageCount: 0,
    },
    ...overrides,
  }
}

describe('fixture capture helpers', () => {
  it('builds deterministic file stems and download names', () => {
    const fileStem = buildFixtureCaptureFileStem('www.boats.com', 'search-ok')

    expect(fileStem).toBe('boats-com--search-ok')
    expect(buildFixtureCaptureFileNames(fileStem)).toEqual([
      'boats-com--search-ok.html',
      'boats-com--search-ok.png',
      'boats-com--search-ok.meta.json',
    ])
  })

  it('slugifies custom labels and falls back to custom when blank', () => {
    expect(resolveFixtureLabel('custom', 'Search Consent Banner')).toBe('search-consent-banner')
    expect(resolveFixtureLabel('custom', '   ')).toBe('custom')
    expect(resolveFixtureLabel('detail-ok', 'ignored')).toBe('detail-ok')
  })

  it('builds metadata with analysis and preset context', () => {
    const metadata = buildFixtureCaptureMetadata({
      capturedAt: '2026-03-29T05:00:00.000Z',
      host: 'www.boats.com',
      fixtureLabel: 'search-ok',
      currentUrl: 'https://www.boats.com/boats-for-sale/',
      title: 'Boats.com Search Results',
      analysis: createAnalysis({
        warnings: ['Search layout changed'],
      }),
      matchedPresetId: null,
      matchedPresetLabel: null,
      appliedPresetId: null,
      appliedPresetLabel: null,
      viewport: {
        width: 1440,
        height: 900,
        scrollX: 0,
        scrollY: 120,
        scrollWidth: 1440,
        scrollHeight: 4800,
        clientWidth: 1440,
        clientHeight: 900,
      },
    })

    expect(metadata).toMatchObject({
      host: 'boats.com',
      fixtureLabel: 'search-ok',
      currentUrl: 'https://www.boats.com/boats-for-sale/',
      pageType: 'search',
      pageState: 'ok',
      analysisWarnings: ['Search layout changed'],
    })
    expect(metadata.stats.listingCardCount).toBe(12)
    expect(metadata.viewport.scrollY).toBe(120)
  })

  it('normalizes persisted fixture-capture session data', () => {
    const fallback = createDefaultFixtureCaptureSessionState()
    const normalized = normalizeFixtureCaptureSessionState({
      selectedTemplate: 'detail-ok',
      customLabel: 'Noisy Gallery',
      captured: {
        'detail-ok': {
          template: 'detail-ok',
          fileStem: 'boats-com--detail-ok',
          files: ['boats-com--detail-ok.html'],
          currentUrl: 'https://www.boats.com/power-boats/example-123/',
          pageType: 'detail',
          pageState: 'ok',
          capturedAt: '2026-03-29T05:05:00.000Z',
        },
      },
      lastCapture: {
        template: 'detail-ok',
        fileStem: 'boats-com--detail-ok',
        files: ['boats-com--detail-ok.html'],
        currentUrl: 'https://www.boats.com/power-boats/example-123/',
        pageType: 'detail',
        pageState: 'ok',
        capturedAt: '2026-03-29T05:05:00.000Z',
      },
    }, fallback)

    expect(normalized.selectedTemplate).toBe('detail-ok')
    expect(normalized.customLabel).toBe('Noisy Gallery')
    expect(normalized.captured['detail-ok'].fileStem).toBe('boats-com--detail-ok')
    expect(normalized.captured['search-ok'].fileStem).toBeNull()
    expect(normalized.lastCapture?.template).toBe('detail-ok')
  })

  it('evaluates guided templates against the latest analysis snapshot', () => {
    const searchOk = evaluateFixtureCaptureTemplate(
      'search-ok',
      createAnalysis(),
      'https://www.boats.com/boats-for-sale/',
    )
    const searchNoResults = evaluateFixtureCaptureTemplate(
      'search-no-results',
      createAnalysis({ pageState: 'no_results' }),
      'https://www.boats.com/boats-for-sale/',
    )
    const detailGalleryNoise = evaluateFixtureCaptureTemplate(
      'detail-gallery-noise',
      createAnalysis({
        pageType: 'detail',
        pageUrl: 'https://www.boats.com/power-boats/example-123/',
        stats: {
          detailLinkCount: 0,
          listingCardCount: 0,
          distinctImageCount: 4,
        },
      }),
      'https://www.boats.com/power-boats/example-123/',
    )

    expect(searchOk.status).toBe('match')
    expect(searchNoResults.status).toBe('match')
    expect(detailGalleryNoise.status).toBe('match')
  })
})
