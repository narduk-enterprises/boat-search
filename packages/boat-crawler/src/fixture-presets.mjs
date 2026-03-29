export const FIXTURE_PRESETS = {
  'boats-com': {
    'search-ok': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/boats-com/search-ok.html',
      defaultUrl:
        'https://www.boats.com/boats-for-sale/?condition=used&boat-type=power&class=power-saltfish&price=100000-200000&distance=100&postal-code=77388',
      mirrorHtmlOutputs: ['../boat-crawler/tests/fixtures/boats-com/search-ok.html'],
    },
    'search-no-results': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/boats-com/search-no-results.html',
      mirrorHtmlOutputs: ['../boat-crawler/tests/fixtures/boats-com/no-results.html'],
    },
    'detail-ok': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/boats-com/detail-ok.html',
    },
  },
  yachtworld: {
    'search-ok': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/yachtworld/search-ok.html',
      defaultUrl:
        'https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/price-100000,500000/?',
      mirrorHtmlOutputs: ['../boat-crawler/tests/fixtures/yachtworld/search-ok.html'],
    },
    'search-no-results': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/yachtworld/search-no-results.html',
    },
    'detail-ok': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/yachtworld/detail-ok.html',
    },
    'detail-gallery-noise': {
      outputPath: '../chrome-scraper-extension/tests/fixtures/yachtworld/detail-gallery-noise.html',
    },
  },
}

export const GUIDED_YACHTWORLD_FIXTURE_ORDER = [
  'search-ok',
  'search-no-results',
  'detail-ok',
  'detail-gallery-noise',
]

export function getFixturePreset(site, fixture) {
  return FIXTURE_PRESETS[site]?.[fixture] || null
}
