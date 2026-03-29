import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@/content/analyzer'
import { createDefaultSession } from '@/shared/defaults'
import {
  applyAnalysisToSession,
  buildAnalysisStatusMessage,
  createSampleDetailRunState,
  isPaginationAutoDetected,
  isTrustedPresetReady,
} from '@/sidepanel/state/sessionState'
import { buildPresetDraft } from '@/shared/sitePresets'

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

    expect([opening.status, opened.status, scanned.status]).toEqual(['opening', 'opened', 'scanned'])
    expect(scanned.fieldCount).toBe(5)
    expect(scanned.imageCount).toBe(4)
  })

  it('treats trusted presets as ready without a mandatory detail scan', () => {
    const session = createDefaultSession()
    session.preset.appliedPresetId = 'yachtworld-search'
    session.preset.appliedPresetLabel = 'YachtWorld Search'
    session.draft = buildPresetDraft('yachtworld-search', {
      pageUrl: 'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
      analysis: null,
    })

    expect(isTrustedPresetReady(session)).toBe(true)
  })
})
