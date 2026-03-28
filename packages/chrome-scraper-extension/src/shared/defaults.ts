import type { ExtensionSession, ScraperFieldRule, ScraperFieldScope, ScraperPipelineDraft } from './types'

export function createFieldRule(
  key: ScraperFieldRule['key'],
  scope: ScraperFieldScope,
  selector = '',
  overrides: Partial<ScraperFieldRule> = {},
): ScraperFieldRule {
  return {
    key,
    scope,
    selector,
    extract: 'text',
    attribute: '',
    multiple: false,
    joinWith: '\n',
    transform: key === 'url' || key === 'images' ? 'url' : key === 'price' ? 'price' : key === 'year' ? 'year' : 'text',
    regex: '',
    required: key === 'url' || key === 'title',
    ...overrides,
  }
}

export function createEmptyDraft(): ScraperPipelineDraft {
  return {
    name: '',
    boatSource: '',
    description: '',
    active: true,
    config: {
      startUrls: [],
      allowedDomains: [],
      itemSelector: '',
      nextPageSelector: '',
      maxPages: 5,
      maxItemsPerRun: 60,
      fetchDetailPages: true,
      fields: [
        createFieldRule('url', 'item', 'a', { extract: 'attr', attribute: 'href', transform: 'url' }),
        createFieldRule('title', 'item', 'a'),
        createFieldRule('price', 'item', ''),
        createFieldRule('location', 'item', ''),
        createFieldRule('images', 'item', 'img', {
          extract: 'attr',
          attribute: 'src',
          multiple: true,
          transform: 'url',
        }),
        createFieldRule('description', 'detail', 'meta[name="description"]', {
          extract: 'attr',
          attribute: 'content',
          required: false,
        }),
      ],
    },
  }
}

export function createDefaultSession(): ExtensionSession {
  return {
    appBaseUrl: 'https://boat-search.nard.uk',
    currentTabUrl: null,
    stage: 'search',
    sampleDetailUrl: null,
    lastAnalysis: null,
    draft: createEmptyDraft(),
  }
}

export function getFieldTitle(field: ScraperFieldRule) {
  return `${field.scope === 'detail' ? 'Detail' : 'Item'} · ${field.key}`
}
