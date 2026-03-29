import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@/content/analyzer'
import { createEmptyDraft } from '@/shared/defaults'
import {
  buildPresetDraft,
  buildRuntimePresetDraft,
  canAutoApplySitePreset,
  findMatchingSitePreset,
  isDefaultDraft,
  normalizePresetRecord,
} from '@/shared/sitePresets'
import type { BrowserScrapeRecord } from '@/shared/types'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readFixture(...segments: string[]) {
  return readFileSync(resolve(__dirname, '..', '..', ...segments), 'utf8')
}

function createDocument(html: string, url: string) {
  return new JSDOM(html, { url }).window.document
}

describe('site presets', () => {
  it('matches YachtWorld search and detail pages but ignores unrelated URLs', () => {
    expect(
      findMatchingSitePreset(
        'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
      ),
    ).toMatchObject({
      id: 'yachtworld-search',
      context: 'search',
    })

    expect(
      findMatchingSitePreset(
        'https://www.yachtworld.com/yacht/viking-52-convertible-1234567/',
      ),
    ).toMatchObject({
      id: 'yachtworld-search',
      context: 'detail',
    })

    expect(findMatchingSitePreset('https://example.com/boats-for-sale')).toBeNull()
  })

  it('builds a YachtWorld preset draft with full search and detail rules', () => {
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
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
    )
    const analysis = analyzeDocument(document, document.location.href)
    const draft = buildPresetDraft('yachtworld-search', {
      pageUrl: document.location.href,
      analysis,
    })

    expect(draft.boatSource).toBe('YachtWorld')
    expect(draft.config.startUrls).toEqual([document.location.href])
    expect(draft.config.allowedDomains).toEqual(
      expect.arrayContaining(['www.yachtworld.com', 'images.yachtworld.com']),
    )
    expect(draft.config.itemSelector).toBe(analysis.itemSelector)
    expect(draft.config.nextPageSelector).toBe(analysis.nextPageSelector)
    expect(draft.config.fetchDetailPages).toBe(true)
    expect(draft.config.fields.map((field) => `${field.scope}:${field.key}`)).toEqual(
      expect.arrayContaining([
        'item:url',
        'item:title',
        'item:listingId',
        'item:year',
        'item:make',
        'item:model',
        'item:price',
        'item:currency',
        'item:location',
        'item:city',
        'item:state',
        'item:country',
        'item:images',
        'detail:title',
        'detail:year',
        'detail:make',
        'detail:model',
        'detail:length',
        'detail:price',
        'detail:currency',
        'detail:location',
        'detail:city',
        'detail:state',
        'detail:country',
        'detail:description',
        'detail:sellerType',
        'detail:listingType',
        'detail:images',
        'detail:fullText',
      ]),
    )
  })

  it('only auto-applies the preset when the current draft is empty or already the same preset', () => {
    const match = findMatchingSitePreset(
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
    )

    expect(
      canAutoApplySitePreset({
        draft: createEmptyDraft(),
        appliedPresetId: null,
        isDraftDirty: false,
        match,
      }),
    ).toBe(true)

    const foreignDraft = createEmptyDraft()
    foreignDraft.name = 'Manual brokerage draft'
    foreignDraft.boatSource = 'Manual source'
    foreignDraft.config.startUrls = ['https://example.com/search']

    expect(
      canAutoApplySitePreset({
        draft: foreignDraft,
        appliedPresetId: null,
        isDraftDirty: true,
        match,
      }),
    ).toBe(false)

    expect(
      canAutoApplySitePreset({
        draft: foreignDraft,
        appliedPresetId: 'yachtworld-search',
        isDraftDirty: false,
        match,
      }),
    ).toBe(true)

    expect(isDefaultDraft(createEmptyDraft())).toBe(true)
  })

  it('normalizes YachtWorld titles, locations, and images to the active listing only', () => {
    const record: BrowserScrapeRecord = {
      source: 'YachtWorld',
      url: 'https://www.yachtworld.com/yacht/2015-ocean-yachts-37-express-10122711/',
      listingId: null,
      title: 'Featured2015 Ocean Yachts 37 Express | 37ftUS$499,999US $2,952/mo',
      make: null,
      model: null,
      year: null,
      length: null,
      price: '499999',
      currency: null,
      location: 'Valhalla Yacht Sales | Longport, New Jersey',
      city: null,
      state: null,
      country: null,
      description:
        'Find more information and images about the boat and contact the seller or search more boats for sale on YachtWorld.',
      sellerType: null,
      listingType: null,
      images: [
        'https://images.boatsgroup.com/resize/1/27/11/2015-ocean-yachts-37-express-power-10122711-20260325035117616-1.jpg?w=1028&format=webp',
        'https://images.boatsgroup.com/resize/1/27/11/2015-ocean-yachts-37-express-power-10122711-20260325035117616-1.jpg?w=200&format=webp',
        'https://img.youtube.com/vi/hDD407S6dDc/0.jpg',
        'https://images.boatsgroup.com/resize/1/upload/Valhalla+Yacht+Sales+Logo.png?w=122&h=115&format=webp',
        'https://images.boatsgroup.com/resize/profiles/jpapperman/jpapperman-1772226817829.jpeg',
        'https://images.boatsgroup.com/resize/1/90/78/2026-sportsman-open-302-center-console-power-10089078-20260220064759110-1.jpg?w=308&ratio=default&t=1771599781000&exact&format=webp',
      ],
      fullText: null,
      rawFields: {},
      warnings: [],
    }

    const normalized = normalizePresetRecord('yachtworld-search', record, {
      context: 'detail',
      pageUrl: record.url!,
    })

    expect(normalized.title).toBe('2015 Ocean Yachts 37 Express | 37ft')
    expect(normalized.location).toBe('Longport, New Jersey')
    expect(normalized.city).toBe('Longport')
    expect(normalized.state).toBe('New Jersey')
    expect(normalized.description).toBeNull()
    expect(normalized.length).toBe('37ft')
    expect(normalized.images).toEqual([
      'https://images.boatsgroup.com/resize/1/27/11/2015-ocean-yachts-37-express-power-10122711-20260325035117616-1.jpg?w=1028&format=webp',
    ])
  })

  it('builds a runtime preset draft that preserves crawl settings but replaces stale selectors', () => {
    const draft = createEmptyDraft()
    draft.name = 'Manual YachtWorld draft'
    draft.boatSource = 'YachtWorld'
    draft.config.startUrls = [
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
    ]
    draft.config.allowedDomains = ['www.yachtworld.com']
    draft.config.maxPages = 7
    draft.config.maxItemsPerRun = 42
    draft.config.fetchDetailPages = true
    draft.config.itemSelector = '.stale-card'
    draft.config.nextPageSelector = '.stale-next'
    draft.config.fields = [
      {
        key: 'images',
        scope: 'detail',
        selector: '.stale-images img',
        extract: 'attr',
        attribute: 'src',
        multiple: true,
        joinWith: '\n',
        transform: 'url',
        regex: '',
        required: false,
      },
    ]

    const runtimeDraft = buildRuntimePresetDraft(
      draft,
      'yachtworld-search',
      draft.config.startUrls[0]!,
    )

    expect(runtimeDraft.config.startUrls).toEqual(draft.config.startUrls)
    expect(runtimeDraft.config.maxPages).toBe(7)
    expect(runtimeDraft.config.maxItemsPerRun).toBe(42)
    expect(runtimeDraft.config.fetchDetailPages).toBe(true)
    expect(runtimeDraft.config.itemSelector).toBe('div.grid-item')
    expect(runtimeDraft.config.nextPageSelector).toContain('a.next')
    expect(runtimeDraft.config.allowedDomains).toEqual(
      expect.arrayContaining(['www.yachtworld.com', 'images.yachtworld.com']),
    )
    expect(
      runtimeDraft.config.fields.find(
        (field) => field.scope === 'detail' && field.key === 'images',
      )?.selector,
    ).toContain('div.style-module_mediaCarousel__gADiR')
  })
})
