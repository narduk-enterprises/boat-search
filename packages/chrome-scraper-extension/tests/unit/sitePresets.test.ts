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
  it('matches Boats.com search and detail pages but ignores unrelated URLs', () => {
    expect(
      findMatchingSitePreset(
        'https://www.boats.com/boats-for-sale/?condition=used&boat-type=power&class=power-saltfish',
      ),
    ).toMatchObject({
      id: 'boats-com-search',
      context: 'search',
    })

    expect(
      findMatchingSitePreset(
        'https://www.boats.com/power-boats/2023-pathfinder-2700-open-10066742/',
      ),
    ).toMatchObject({
      id: 'boats-com-search',
      context: 'detail',
    })

    expect(findMatchingSitePreset('https://example.com/power-boats/123')).toBeNull()
  })

  it('builds a Boats.com preset draft with full search and detail rules', () => {
    const html = readFixture('tests', 'fixtures', 'boats-com', 'search-ok.html')
    const document = createDocument(
      html,
      'https://www.boats.com/boats-for-sale/?condition=used&boat-type=power&class=power-saltfish&price=100000-200000&distance=100&postal-code=77388',
    )
    const analysis = analyzeDocument(document, document.location.href)
    const draft = buildPresetDraft('boats-com-search', {
      pageUrl: document.location.href,
      analysis,
    })

    expect(draft.boatSource).toBe('Boats.com')
    expect(draft.config.startUrls).toEqual([document.location.href])
    expect(draft.config.allowedDomains).toEqual(
      expect.arrayContaining(['www.boats.com', 'images.boats.com']),
    )
    expect(draft.config.itemSelector).toBe('li[data-listing-id]')
    expect(draft.config.nextPageSelector).toBeTruthy()
    expect(draft.config.fetchDetailPages).toBe(true)
    expect(draft.config.fields.map((field) => `${field.scope}:${field.key}`)).toEqual(
      expect.arrayContaining([
        'item:url',
        'item:listingId',
        'item:title',
        'item:year',
        'item:price',
        'item:currency',
        'item:location',
        'item:city',
        'item:state',
        'item:country',
        'item:images',
        'detail:listingId',
        'detail:title',
        'detail:year',
        'detail:price',
        'detail:currency',
        'detail:location',
        'detail:city',
        'detail:state',
        'detail:country',
        'detail:length',
        'detail:description',
        'detail:images',
        'detail:fullText',
      ]),
    )
  })

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

  it('normalizes Boats.com records from title, location, currency, and listing images', () => {
    const record: BrowserScrapeRecord = {
      source: 'Boats.com',
      url: 'https://www.boats.com/power-boats/2023-pathfinder-2700-open-10066742/',
      listingId: null,
      title: 'Pathfinder 2700 Open',
      make: null,
      model: null,
      year: 2023,
      length: '27 ft',
      price: '155000',
      currency: null,
      location: 'Kemah, Texas',
      city: null,
      state: null,
      country: null,
      description: null,
      sellerType: null,
      listingType: null,
      images: [
        'https://images.boats.com/resize/1/67/42/2023-pathfinder-2700-open-power-10066742-20260127073449011-1.jpg?t=1769527995000',
        'https://images.boats.com/resize/1/67/42/2023-pathfinder-2700-open-power-10066742-20260127073449011-1.jpg?t=1769527995000&w=160&h=160',
        'https://images.boats.com/resize/1/67/42/2023-pathfinder-2700-open-power-10066742-20260127073449256-2.jpg?t=1769527995000',
        'https://images.boats.com/resize/1/upload/dealer-logo.png?w=122&h=115',
      ],
      fullText: 'Pathfinder 2700 Open Length 27 ft Fuel Type Gas',
      rawFields: {
        price: '$155,000',
      },
      warnings: [],
    }

    const normalized = normalizePresetRecord('boats-com-search', record, {
      context: 'detail',
      pageUrl: record.url!,
    })

    expect(normalized.listingId).toBe('10066742')
    expect(normalized.make).toBe('Pathfinder')
    expect(normalized.model).toBe('2700 Open')
    expect(normalized.city).toBe('Kemah')
    expect(normalized.state).toBe('Texas')
    expect(normalized.country).toBe('US')
    expect(normalized.currency).toBe('USD')
    expect(normalized.images).toEqual([
      'https://images.boats.com/resize/1/67/42/2023-pathfinder-2700-open-power-10066742-20260127073449011-1.jpg?t=1769527995000',
      'https://images.boats.com/resize/1/67/42/2023-pathfinder-2700-open-power-10066742-20260127073449256-2.jpg?t=1769527995000',
    ])
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

  it('preserves used listing type from the search URL and falls back to non-matching gallery photos when needed', () => {
    const record: BrowserScrapeRecord = {
      source: 'YachtWorld',
      url: 'https://www.yachtworld.com/yacht/2021-sportsman-open-282-center-console-9973024/',
      listingId: '9973024',
      title: '2021 Sportsman Open 282 Center Console | 28ft',
      make: null,
      model: null,
      year: 2021,
      length: null,
      price: '165000',
      currency: null,
      location: 'Port Aransas, Texas',
      city: null,
      state: null,
      country: null,
      description:
        "Super nice 28' Sportsman with low time 300HP Yamahas 93 Hours New hull side paint May 2024",
      sellerType: null,
      listingType: null,
      images: [
        'https://images.boatsgroup.com/resize/1/41/87/2021-sportsman-open-282-center-console-power-10094187-20260101010101010-1.jpg?w=1028&format=webp',
        'https://images.boatsgroup.com/resize/1/upload/dealer-logo.png?w=122&format=webp',
        'data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22/%3E',
      ],
      fullText:
        "Boat Details Description Super nice 28' Sportsman with low time 300HP Yamahas 93 Hours New hull side paint May 2024",
      rawFields: {},
      warnings: [],
    }

    const normalizedSearch = normalizePresetRecord('yachtworld-search', record, {
      context: 'search',
      pageUrl:
        'https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/',
    })

    expect(normalizedSearch.listingType).toBe('used')
    expect(normalizedSearch.images).toEqual([
      'https://images.boatsgroup.com/resize/1/41/87/2021-sportsman-open-282-center-console-power-10094187-20260101010101010-1.jpg?w=1028&format=webp',
    ])

    const normalizedDetail = normalizePresetRecord('yachtworld-search', normalizedSearch, {
      context: 'detail',
      pageUrl: record.url!,
    })

    expect(normalizedDetail.listingType).toBe('used')
    expect(normalizedDetail.images).toEqual([
      'https://images.boatsgroup.com/resize/1/41/87/2021-sportsman-open-282-center-console-power-10094187-20260101010101010-1.jpg?w=1028&format=webp',
    ])
  })

  it('parses YachtWorld contact, propulsion, and specification fields from detail text', () => {
    const record: BrowserScrapeRecord = {
      source: 'YachtWorld',
      url: 'https://www.yachtworld.com/yacht/2021-century-2901-center-console-10099971/',
      listingId: '10099971',
      title: '2021 Century 2901 Center Console | 29ft',
      make: null,
      model: null,
      year: 2021,
      length: null,
      price: '149900',
      currency: null,
      location: 'Lake Charles, Louisiana',
      city: null,
      state: null,
      country: null,
      description:
        'Very clean 2021 Century Boats 29 Ft Center Console! This boat is ready for its next adventure.',
      sellerType: null,
      listingType: null,
      images: [],
      fullText:
        "Boat DetailsDescriptionVery clean 2021 Century Boats 29 Ft Center Console! This boat is ready for its next adventure. Show MoreContact InformationPlease contact Carlos Lopez at (305) 758-5786PropulsionEngine 1Engine Make:YAMAHAEngine Model:300HPEngine Year:2021Total Power:300hpEngine Type:OutboardDrive Type:OtherFuel Type:GasEngine 2Engine Make:YAMAHAEngine Model:300HPEngine Year:2021Total Power:300hpEngine Type:OutboardFuel Type:GasSpecificationsSpeed & DistanceCruising Speed:32knMax Speed:54knDimensionsLength Overall:29ftMin Draft:1.67ftBeam:9.5ftWeightsDry Weight:7,000LbMiscellaneousElectrical Circuit:noneHull Material:FiberglassHull Shape:OtherKeel Type:OtherTanksFresh Water Tank:Fuel Tank:1 x 280 gal Holding Tank:AccommodationsGuest Heads:1Want more specs?Ask the seller",
      rawFields: {},
      warnings: [],
    }

    const normalized = normalizePresetRecord('yachtworld-search', record, {
      context: 'detail',
      pageUrl: record.url!,
    })

    expect(normalized.contactName).toBe('Carlos Lopez')
    expect(normalized.contactPhone).toBe('(305) 758-5786')
    expect(normalized.propulsion).toContain('Engine Make:YAMAHA')
    expect(normalized.engineMake).toBe('YAMAHA')
    expect(normalized.engineModel).toBe('300HP')
    expect(normalized.engineYearDetail).toBe('2021')
    expect(normalized.totalPower).toBe('300hp')
    expect(normalized.engineTypeDetail).toBe('Outboard')
    expect(normalized.driveType).toBe('Other')
    expect(normalized.fuelTypeDetail).toBe('Gas')
    expect(normalized.specifications).toContain('Cruising Speed:32kn')
    expect(normalized.cruisingSpeed).toBe('32kn')
    expect(normalized.maxSpeed).toBe('54kn')
    expect(normalized.lengthOverall).toBe('29ft')
    expect(normalized.minDraftDetail).toBe('1.67ft')
    expect(normalized.beamDetail).toBe('9.5ft')
    expect(normalized.dryWeight).toBe('7,000Lb')
    expect(normalized.electricalCircuit).toBe('none')
    expect(normalized.hullMaterial).toBe('Fiberglass')
    expect(normalized.hullShape).toBe('Other')
    expect(normalized.keelType).toBe('Other')
    expect(normalized.fuelTank).toBe('1 x 280 gal')
    expect(normalized.guestHeads).toBe('1')
  })

  it('parses YachtWorld features and disclaimer fields from detail text', () => {
    const record: BrowserScrapeRecord = {
      source: 'YachtWorld',
      url: 'https://www.yachtworld.com/yacht/2018-tidewater-2700-carolina-bay-9423709/',
      listingId: '9423709',
      title: '2018 TideWater 2700 Carolina Bay | 27ft',
      make: null,
      model: null,
      year: 2018,
      length: null,
      price: '159995',
      currency: null,
      location: 'Houston, Texas',
      city: null,
      state: null,
      country: null,
      description: null,
      sellerType: null,
      listingType: null,
      images: [],
      fullText:
        "Boat DetailsDescription2018 TideWater 2700 CB - With Every Option Show MoreContact InformationPlease contact Chris Thomas at 713-870-3299Other DetailsManufacturer Provided DescriptionThis Carolina Bay model is a large, stepped bottom, feature full, high end, family friendly performance bay boat.Standard Features White Ivory or Sahara Interior DisclaimerThe Company offers the details of this vessel in good faith but cannot guarantee or warrant the accuracy of this information nor warrant the condition of the vessel. A buyer should instruct his agents, or his surveyors, to investigate such details as the buyer desires validated. This vessel is offered subject to prior sale, price change, or withdrawal without notice.Need more details?Ask the sellerFeaturesElectronicsDepthsounder:✓Radio:✓Compass:✓GPS:✓Cockpit Speakers:✓VHF:✓Inside EquipmentElectric Bilge Pump:✓Marine Head:✓Battery Charger:✓Outside EquipmentCockpit Shower:✓Outboard Engine Brackets:Bobs Jack PlatesCockpit Cushions:✓Swimming Ladder:✓Power Poles:✓Additional EquipmentRoad Trailer:New TiresUnderwater Lights:✓Want more features?Ask the sellerPropulsionEngine 1Engine Make:MercuryEngine Model:250REngine Year:2018Total Power:250hpEngine Hours:180Engine Type:OutboardFuel Type:GasPropeller Type:4 BladePropeller Material:Stainless SteelSpecificationsSpeed & DistanceCruising Speed:27.81knMax Speed:57.35knRange:269.38nmDimensionsLength Overall:27.17ftMax Bridge Clearance:8ftMax Draft:1.83ftBeam:9.33ftWeightsDry Weight:4,100LbMiscellaneousWindlass:Electric WindlassDeadrise At Transom:15degHull Material:FiberglassHull Shape:Modified VeeTanksFresh Water Tank:10 gal Fuel Tank:141 gal Holding Tank:Want more specs?Ask the seller",
      rawFields: {},
      warnings: [],
    }

    const normalized = normalizePresetRecord('yachtworld-search', record, {
      context: 'detail',
      pageUrl: record.url!,
    })

    expect(normalized.contactName).toBe('Chris Thomas')
    expect(normalized.contactPhone).toBe('713-870-3299')
    expect(normalized.otherDetails).toContain('Manufacturer Provided Description')
    expect(normalized.disclaimer).toContain('good faith')
    expect(normalized.features).toContain('Electronics')
    expect(normalized.electronics).toBe(
      'Depthsounder | Radio | Compass | GPS | Cockpit Speakers | VHF',
    )
    expect(normalized.insideEquipment).toContain('Marine Head')
    expect(normalized.outsideEquipment).toContain(
      'Outboard Engine Brackets: Bobs Jack Plates',
    )
    expect(normalized.additionalEquipment).toContain('Road Trailer: New Tires')
    expect(normalized.additionalEquipment).toContain('Underwater Lights')
    expect(normalized.engineHours).toBe('180')
    expect(normalized.propellerType).toBe('4 Blade')
    expect(normalized.propellerMaterial).toBe('Stainless Steel')
    expect(normalized.range).toBe('269.38nm')
    expect(normalized.maxBridgeClearance).toBe('8ft')
    expect(normalized.maxDraft).toBe('1.83ft')
    expect(normalized.windlass).toBe('Electric Windlass')
    expect(normalized.deadriseAtTransom).toBe('15deg')
    expect(normalized.hullShape).toBe('Modified Vee')
    expect(normalized.freshWaterTank).toBe('10 gal')
    expect(normalized.fuelTank).toBe('141 gal')
  })

  it('builds a runtime preset draft that preserves crawl settings but replaces stale selectors', () => {
    const draft = createEmptyDraft()
    draft.name = 'Manual YachtWorld draft'
    draft.boatSource = 'YachtWorld'
    draft.config.startUrls = [
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
    ]
    draft.config.allowedDomains = ['www.yachtworld.com']
    draft.config.maxPages = 120
    draft.config.maxItemsPerRun = 1500
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
    expect(runtimeDraft.config.maxPages).toBe(120)
    expect(runtimeDraft.config.maxItemsPerRun).toBe(1500)
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
    expect(
      runtimeDraft.config.fields.some(
        (field) => field.scope === 'detail' && field.key === 'url',
      ),
    ).toBe(false)
  })
})
