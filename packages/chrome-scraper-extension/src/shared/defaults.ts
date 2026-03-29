import type {
  ExtensionConnection,
  ExtensionPresetState,
  ExtensionSession,
  ScraperFieldRule,
  ScraperFieldScope,
  ScraperPipelineDraft,
} from './types'

export type SessionDefaults = Partial<Omit<ExtensionSession, 'connection' | 'preset' | 'draft'>> & {
  connection?: Partial<ExtensionConnection>
  preset?: Partial<ExtensionPresetState>
  draft?: ScraperPipelineDraft
}

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

export function createDefaultConnection(): ExtensionConnection {
  return {
    apiKey: '',
    apiKeySource: null,
    verifiedAt: null,
    verifiedEmail: null,
    verifiedName: null,
    imageUploadEnabled: false,
  }
}

export function createDefaultPresetState(): ExtensionPresetState {
  return {
    matchedPresetId: null,
    matchedPresetLabel: null,
    matchedContext: null,
    appliedPresetId: null,
    appliedPresetLabel: null,
    appliedForUrl: null,
    applicationMode: null,
    appliedDraftFingerprint: null,
    isDraftDirty: false,
  }
}

export function createDefaultSession(overrides: SessionDefaults = {}): ExtensionSession {
  const connection = {
    ...createDefaultConnection(),
    ...(overrides.connection ?? {}),
  }
  const preset = {
    ...createDefaultPresetState(),
    ...(overrides.preset ?? {}),
  }
  const baseSession: ExtensionSession = {
    appBaseUrl: 'https://boat-search.nard.uk',
    appBaseUrlSource: null,
    connection,
    currentTabUrl: null,
    stage: 'search',
    sampleDetailUrl: null,
    lastAnalysis: null,
    preset,
    draft: overrides.draft ? structuredClone(overrides.draft) : createEmptyDraft(),
  }

  return {
    ...baseSession,
    ...overrides,
    connection,
    preset,
    draft: baseSession.draft,
  }
}

export function getFieldTitle(field: ScraperFieldRule) {
  return `${field.scope === 'detail' ? 'Detail' : 'Item'} · ${field.key}`
}
