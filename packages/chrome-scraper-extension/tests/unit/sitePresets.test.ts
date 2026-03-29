import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { analyzeDocument } from '@/content/analyzer'
import { createEmptyDraft } from '@/shared/defaults'
import {
  buildPresetDraft,
  canAutoApplySitePreset,
  findMatchingSitePreset,
  isDefaultDraft,
} from '@/shared/sitePresets'

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
})
