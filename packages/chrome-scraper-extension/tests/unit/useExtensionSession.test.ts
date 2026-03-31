import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession, createFieldRule } from '@/shared/defaults'
import { useExtensionSession } from '@/sidepanel/composables/useExtensionSession'

const STORAGE_KEY = 'boat-search-extension-session-v3'

type ListenerApi = {
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
}

type ChromeStorageState = Record<string, unknown>
type ChromeTab = {
  id: number
  url: string
  status?: 'complete' | 'loading'
  active?: boolean
}
type ChromeMockOptions = {
  activeTab?: ChromeTab
  queryTabs?: () => Promise<ChromeTab[]>
  getTab?: (tabId: number) => Promise<ChromeTab>
  updateTab?: (tabId: number, properties: { url?: string }) => Promise<ChromeTab>
  createTab?: (properties: { url?: string; active?: boolean }) => Promise<ChromeTab>
  sendTabMessage?: (tabId: number, message: object) => Promise<unknown>
}

function createListenerApi(): ListenerApi {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
}

function createChromeMock(storedSession?: unknown, options: ChromeMockOptions = {}) {
  const storageState: ChromeStorageState = {}
  if (storedSession !== undefined) {
    storageState[STORAGE_KEY] = structuredClone(storedSession)
  }

  let activeTab =
    options.activeTab ??
    ({
      id: 1,
      url: 'https://www.yachtworld.com/boats-for-sale/',
      status: 'complete',
      active: true,
    } satisfies ChromeTab)

  const local = {
    get: vi.fn(async (key: string) => ({
      [key]: storageState[key],
    })),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(storageState, structuredClone(values))
    }),
  }

  return {
    storageState,
    chrome: {
      storage: {
        local,
      },
      runtime: {
        onMessage: createListenerApi(),
        sendMessage: vi.fn(),
      },
      tabs: {
        onActivated: createListenerApi(),
        onUpdated: createListenerApi(),
        query: vi.fn(async () =>
          options.queryTabs ? await options.queryTabs() : [structuredClone(activeTab)],
        ),
        get: vi.fn(async (tabId: number) =>
          options.getTab ? await options.getTab(tabId) : structuredClone(activeTab),
        ),
        update: vi.fn(async (tabId: number, properties: { url?: string }) => {
          if (options.updateTab) {
            activeTab = await options.updateTab(tabId, properties)
            return structuredClone(activeTab)
          }

          activeTab = {
            ...activeTab,
            url: properties.url ?? activeTab.url,
            status: 'complete',
          }
          return structuredClone(activeTab)
        }),
        create: vi.fn(async (properties: { url?: string; active?: boolean }) => {
          if (options.createTab) {
            activeTab = await options.createTab(properties)
            return structuredClone(activeTab)
          }

          activeTab = {
            id: activeTab.id + 1,
            url: properties.url ?? activeTab.url,
            status: 'complete',
            active: properties.active ?? true,
          }
          return structuredClone(activeTab)
        }),
        sendMessage: vi.fn(async (tabId: number, message: object) =>
          options.sendTabMessage ? await options.sendTabMessage(tabId, message) : null,
        ),
      },
      scripting: {
        executeScript: vi.fn(async () => undefined),
      },
    },
  }
}

async function flushSessionWatchers() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useExtensionSession', () => {
  let scope: EffectScope | null = null

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    scope?.stop()
    scope = null
    vi.unstubAllGlobals()
  })

  it('loads a previously saved manual connection from chrome storage', async () => {
    const storedSession = createDefaultSession()
    storedSession.appBaseUrl = 'https://boat-search.nard.uk'
    storedSession.appBaseUrlSource = 'manual'
    storedSession.connection.apiKey = 'nk_saved_manual'
    storedSession.connection.apiKeySource = 'manual'

    const chromeMock = createChromeMock(storedSession)
    vi.stubGlobal('chrome', chromeMock.chrome)

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })

    await extension.loadSession()

    expect(extension.session.value.appBaseUrl).toBe('https://boat-search.nard.uk')
    expect(extension.session.value.appBaseUrlSource).toBe('manual')
    expect(extension.session.value.connection.apiKey).toBe('nk_saved_manual')
    expect(extension.session.value.connection.apiKeySource).toBe('manual')
  })

  it('keeps the saved connection when clearing scrape state', async () => {
    const chromeMock = createChromeMock()
    vi.stubGlobal('chrome', chromeMock.chrome)

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })

    extension.session.value.appBaseUrl = 'https://boat-search.nard.uk'
    extension.session.value.appBaseUrlSource = 'manual'
    extension.session.value.connection.apiKey = 'nk_saved_manual'
    extension.session.value.connection.apiKeySource = 'manual'
    extension.session.value.connection.verifiedAt = '2026-03-29T10:00:00.000Z'
    extension.session.value.lastAnalysis = {
      pageType: 'search',
      pageState: 'ok',
      stateMessage: null,
      siteName: 'YachtWorld',
      pageUrl:
        'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
      itemSelector: '.listing-card',
      nextPageSelector: '.pagination a.next',
      sampleDetailUrl: 'https://www.yachtworld.com/yacht/test-1234567/',
      fields: [],
      warnings: [],
      stats: {
        detailLinkCount: 3,
        listingCardCount: 9,
        distinctImageCount: 7,
      },
    }
    extension.session.value.draft.config.startUrls = [
      'https://www.yachtworld.com/boats-for-sale/type-power/class-power-saltwater-fishing/',
    ]

    await flushSessionWatchers()
    extension.clearScrapeState()
    await flushSessionWatchers()

    expect(extension.session.value.appBaseUrl).toBe('https://boat-search.nard.uk')
    expect(extension.session.value.connection.apiKey).toBe('nk_saved_manual')
    expect(extension.session.value.connection.verifiedAt).toBe('2026-03-29T10:00:00.000Z')
    expect(extension.session.value.lastAnalysis).toBeNull()
    expect(extension.session.value.draft.config.startUrls).toEqual([])
    expect(extension.statusMessage.value).toMatch(/Scrape state cleared/i)
    expect(chromeMock.storageState[STORAGE_KEY]).toMatchObject({
      appBaseUrl: 'https://boat-search.nard.uk',
      connection: {
        apiKey: 'nk_saved_manual',
      },
    })
  })

  it('scrapes each detail page before moving to the next search page', async () => {
    const searchPageOneUrl = 'https://www.yachtworld.com/boats-for-sale/type-power/page-1/'
    const searchPageTwoUrl = 'https://www.yachtworld.com/boats-for-sale/type-power/page-2/'
    const detailOneUrl = 'https://www.yachtworld.com/yacht/one-123/'
    const detailTwoUrl = 'https://www.yachtworld.com/yacht/two-456/'

    const navigationLog: string[] = []
    const extractionLog: string[] = []
    const persistedDescriptions: Array<string | null> = []

    const chromeMock = createChromeMock(undefined, {
      activeTab: {
        id: 7,
        url: searchPageOneUrl,
        status: 'complete',
        active: true,
      },
      updateTab: async (tabId, properties) => {
        const nextUrl = properties.url ?? searchPageOneUrl
        navigationLog.push(nextUrl)

        return {
          id: tabId,
          url: nextUrl,
          status: 'complete',
          active: true,
        }
      },
      sendTabMessage: async (_tabId, message) => {
        const typedMessage = message as { type: string }

        if (typedMessage.type === 'EXTENSION_EXTRACT_SEARCH_PAGE') {
          const currentUrl = navigationLog.at(-1) ?? searchPageOneUrl
          extractionLog.push(`search:${currentUrl}`)

          if (currentUrl === searchPageOneUrl) {
            return {
              pageUrl: searchPageOneUrl,
              itemCount: 1,
              nextPageUrl: searchPageTwoUrl,
              warnings: [],
              analysis: {
                pageType: 'search',
                pageState: 'ok',
                stateMessage: null,
                siteName: 'YachtWorld',
                pageUrl: searchPageOneUrl,
                itemSelector: '.listing-card',
                nextPageSelector: 'a.next',
                sampleDetailUrl: detailOneUrl,
                fields: [],
                warnings: [],
                stats: {
                  detailLinkCount: 1,
                  listingCardCount: 1,
                  distinctImageCount: 1,
                },
              },
              records: [
                {
                  source: 'YachtWorld',
                  url: detailOneUrl,
                  listingId: '123',
                  title: 'Boat One',
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
              ],
            }
          }

          return {
            pageUrl: searchPageTwoUrl,
            itemCount: 1,
            nextPageUrl: null,
            warnings: [],
            analysis: {
              pageType: 'search',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: searchPageTwoUrl,
              itemSelector: '.listing-card',
              nextPageSelector: 'a.next',
              sampleDetailUrl: detailTwoUrl,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 1,
                listingCardCount: 1,
                distinctImageCount: 1,
              },
            },
            records: [
              {
                source: 'YachtWorld',
                url: detailTwoUrl,
                listingId: '456',
                title: 'Boat Two',
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
            ],
          }
        }

        if (typedMessage.type === 'EXTENSION_EXTRACT_DETAIL_PAGE') {
          const currentUrl = navigationLog.at(-1) ?? ''
          extractionLog.push(`detail:${currentUrl}`)

          if (currentUrl === detailOneUrl) {
            return {
              pageUrl: detailOneUrl,
              warnings: [],
              analysis: {
                pageType: 'detail',
                pageState: 'ok',
                stateMessage: null,
                siteName: 'YachtWorld',
                pageUrl: detailOneUrl,
                itemSelector: '',
                nextPageSelector: '',
                sampleDetailUrl: null,
                fields: [],
                warnings: [],
                stats: {
                  detailLinkCount: 0,
                  listingCardCount: 0,
                  distinctImageCount: 3,
                },
              },
              record: {
                description: 'Detail page one',
                features: 'Radar | Generator',
                images: [
                  'https://images.yachtworld.com/detail-one-1.jpg',
                  'https://images.yachtworld.com/detail-one-2.jpg',
                ],
              },
            }
          }

          return {
            pageUrl: detailTwoUrl,
            warnings: [],
            analysis: {
              pageType: 'detail',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: detailTwoUrl,
              itemSelector: '',
              nextPageSelector: '',
              sampleDetailUrl: null,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 0,
                listingCardCount: 0,
                distinctImageCount: 4,
              },
            },
            record: {
              description: 'Detail page two',
              propulsion: 'Twin diesel',
              images: [
                'https://images.yachtworld.com/detail-two-1.jpg',
                'https://images.yachtworld.com/detail-two-2.jpg',
              ],
            },
          }
        }

        throw new Error(`Unhandled tab message ${(typedMessage as { type: string }).type}`)
      },
    })
    vi.stubGlobal('chrome', chromeMock.chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const path = new URL(url).pathname

        if (path === '/api/admin/scraper-extension/auth') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: 'user_1',
                email: 'captain@example.com',
                name: 'Captain',
              },
              imageUploadEnabled: true,
              uploadEndpoint: 'https://boat-search.nard.uk/upload',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/start') {
          return new Response(
            JSON.stringify({
              pipelineId: 11,
              jobId: 22,
              startedAt: '2026-03-29T10:00:00.000Z',
              existingBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
              refreshableBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/record') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            record?: { description?: string | null }
          }
          persistedDescriptions.push(payload.record?.description ?? null)

          return new Response(
            JSON.stringify({
              inserted: 1,
              updated: 0,
              imagesUploaded: 0,
              warnings: [],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/progress') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/complete') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (
          path === '/api/admin/scraper-extension/run/listing' ||
          path === '/api/admin/scraper-extension/run/stop'
        ) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        throw new Error(`Unhandled fetch path ${path}`)
      }),
    )

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })

    extension.session.value.connection.apiKey = 'nk_test'
    extension.session.value.connection.apiKeySource = 'manual'
    extension.session.value.preset.appliedPresetId = 'yachtworld-search'
    extension.session.value.preset.appliedPresetLabel = 'YachtWorld Search'
    extension.session.value.currentTabUrl = searchPageOneUrl
    extension.session.value.draft.name = 'YachtWorld test'
    extension.session.value.draft.boatSource = 'YachtWorld'
    extension.session.value.draft.config.startUrls = [searchPageOneUrl]
    extension.session.value.draft.config.allowedDomains = ['www.yachtworld.com']
    extension.session.value.draft.config.itemSelector = '.listing-card'
    extension.session.value.draft.config.nextPageSelector = 'a.next'
    extension.session.value.draft.config.maxPages = 2
    extension.session.value.draft.config.maxItemsPerRun = 10
    extension.session.value.draft.config.fetchDetailPages = true

    await flushSessionWatchers()
    await extension.startScrapeInBoatSearch()

    expect(extractionLog).toEqual([
      `search:${searchPageOneUrl}`,
      `detail:${detailOneUrl}`,
      `search:${searchPageTwoUrl}`,
      `detail:${detailTwoUrl}`,
    ])
    expect(persistedDescriptions).toEqual(['Detail page one', 'Detail page two'])
    expect(extension.errorMessage.value).toBe('')
    expect(extension.statusMessage.value).toMatch(/Browser scrape complete/i)
  })

  it('follows a configured photo page after the detail page and merges the gallery images', async () => {
    const searchPageUrl = 'https://www.yachtworld.com/boats-for-sale/type-power/page-1/'
    const detailUrl = 'https://www.yachtworld.com/yacht/photo-hop-123/'
    const followUrl = 'https://www.yachtworld.com/yacht/photo-hop-123/photos/'

    const navigationLog: string[] = []
    const extractionLog: string[] = []
    let activeUrl = searchPageUrl

    const chromeMock = createChromeMock(undefined, {
      activeTab: {
        id: 9,
        url: searchPageUrl,
        status: 'complete',
        active: true,
      },
      createTab: async (properties) => {
        const nextUrl = properties.url ?? searchPageUrl
        navigationLog.push(nextUrl)
        activeUrl = nextUrl

        return {
          id: 9,
          url: nextUrl,
          status: 'complete',
          active: properties.active ?? true,
        }
      },
      updateTab: async (tabId, properties) => {
        const nextUrl = properties.url ?? searchPageUrl
        navigationLog.push(nextUrl)
        activeUrl = nextUrl

        return {
          id: tabId,
          url: nextUrl,
          status: 'complete',
          active: true,
        }
      },
      sendTabMessage: async (_tabId, message) => {
        const typedMessage = message as {
          type: string
          request?: { scope?: 'detail' | 'detail-follow' }
        }

        if (typedMessage.type === 'EXTENSION_EXTRACT_SEARCH_PAGE') {
          extractionLog.push(`search:${searchPageUrl}`)

          return {
            pageUrl: searchPageUrl,
            itemCount: 1,
            nextPageUrl: null,
            warnings: [],
            analysis: {
              pageType: 'search',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: searchPageUrl,
              itemSelector: '.listing-card',
              nextPageSelector: 'a.next',
              sampleDetailUrl: detailUrl,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 1,
                listingCardCount: 1,
                distinctImageCount: 1,
              },
            },
            records: [
              {
                source: 'YachtWorld',
                url: detailUrl,
                listingId: '123',
                title: 'Photo Hop',
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
            ],
          }
        }

        if (typedMessage.type === 'EXTENSION_EXTRACT_DETAIL_PAGE') {
          const scope = typedMessage.request?.scope ?? 'detail'
          extractionLog.push(`${scope}:${activeUrl}`)

          if (scope === 'detail-follow') {
            return {
              pageUrl: followUrl,
              followPageUrl: null,
              warnings: [],
              analysis: {
                pageType: 'detail',
                pageState: 'ok',
                stateMessage: null,
                siteName: 'YachtWorld',
                pageUrl: followUrl,
                itemSelector: '',
                nextPageSelector: '',
                sampleDetailUrl: null,
                fields: [],
                warnings: [],
                stats: {
                  detailLinkCount: 0,
                  listingCardCount: 0,
                  distinctImageCount: 6,
                },
              },
              record: {
                images: [
                  'https://images.yachtworld.com/photo-hop-1.jpg',
                  'https://images.yachtworld.com/photo-hop-2.jpg',
                  'https://images.yachtworld.com/photo-hop-3.jpg',
                ],
              },
            }
          }

          return {
            pageUrl: detailUrl,
            followPageUrl: followUrl,
            warnings: [],
            analysis: {
              pageType: 'detail',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: detailUrl,
              itemSelector: '',
              nextPageSelector: '',
              sampleDetailUrl: null,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 0,
                listingCardCount: 0,
                distinctImageCount: 1,
              },
            },
            record: {
              description: 'Primary detail page',
              images: ['https://images.yachtworld.com/detail-thumb.jpg'],
            },
          }
        }

        throw new Error(`Unhandled tab message ${(typedMessage as { type: string }).type}`)
      },
    })
    vi.stubGlobal('chrome', chromeMock.chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const path = new URL(url).pathname

        if (path === '/api/admin/scraper-extension/auth') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: 'user_1',
                email: 'captain@example.com',
                name: 'Captain',
              },
              imageUploadEnabled: true,
              uploadEndpoint: 'https://boat-search.nard.uk/upload',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/start') {
          return new Response(
            JSON.stringify({
              runId: 'browser-run-1',
              pipelineId: 12,
              existingBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
              refreshableBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/record') {
          return new Response(
            JSON.stringify({
              inserted: 1,
              updated: 0,
              imagesUploaded: 0,
              warnings: [],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/progress') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/complete') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (
          path === '/api/admin/scraper-extension/run/listing' ||
          path === '/api/admin/scraper-extension/run/stop'
        ) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        throw new Error(`Unhandled fetch request ${url}`)
      }),
    )

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })
    await extension.loadSession()

    extension.session.value.connection.apiKey = 'test-key'
    extension.session.value.connection.apiKeySource = 'manual'
    extension.session.value.connection.verifiedAt = new Date().toISOString()
    extension.session.value.connection.verifiedEmail = 'captain@example.com'
    extension.session.value.connection.imageUploadEnabled = true
    extension.session.value.preset.appliedPresetId = 'yachtworld-search'
    extension.session.value.preset.appliedPresetLabel = 'YachtWorld Search'
    extension.session.value.currentTabUrl = searchPageUrl
    extension.session.value.draft.name = 'YachtWorld test'
    extension.session.value.draft.boatSource = 'YachtWorld'
    extension.session.value.draft.config.startUrls = [searchPageUrl]
    extension.session.value.draft.config.allowedDomains = ['www.yachtworld.com']
    extension.session.value.draft.config.itemSelector = '.listing-card'
    extension.session.value.draft.config.nextPageSelector = 'a.next'
    extension.session.value.draft.config.detailFollowLinkSelector = 'a[href*=\"/photos/\"]'
    extension.session.value.draft.config.maxPages = 1
    extension.session.value.draft.config.maxItemsPerRun = 10
    extension.session.value.draft.config.fetchDetailPages = true
    extension.session.value.draft.config.fields = [
      createFieldRule('url', 'item', 'a', {
        extract: 'attr',
        attribute: 'href',
        transform: 'url',
      }),
      createFieldRule('description', 'detail', '.description'),
      createFieldRule('images', 'detail-follow', 'img', {
        extract: 'attr',
        attribute: 'src',
        multiple: true,
        transform: 'url',
        required: false,
      }),
    ]

    await flushSessionWatchers()
    await extension.startScrapeInBoatSearch()

    expect(
      extractionLog.filter((entry) => entry === `search:${searchPageUrl}`).length,
    ).toBeGreaterThanOrEqual(1)
    expect(extractionLog.slice(-2)).toEqual([`detail:${detailUrl}`, `detail-follow:${followUrl}`])
    expect(extension.errorMessage.value).toBe('')
  })

  it('stops an active browser scrape cleanly when the user requests cancellation', async () => {
    const searchPageUrl = 'https://www.yachtworld.com/boats-for-sale/type-power/page-1/'
    const detailUrl = 'https://www.yachtworld.com/yacht/cancel-me-123/'

    let resolveSearchPage: ((value: unknown) => void) | null = null
    const fetchPaths: string[] = []
    const extractionLog: string[] = []

    const chromeMock = createChromeMock(undefined, {
      activeTab: {
        id: 10,
        url: searchPageUrl,
        status: 'complete',
        active: true,
      },
      updateTab: async (tabId, properties) => ({
        id: tabId,
        url: properties.url ?? searchPageUrl,
        status: 'complete',
        active: true,
      }),
      sendTabMessage: async (_tabId, message) => {
        const typedMessage = message as { type: string }

        if (typedMessage.type === 'EXTENSION_EXTRACT_SEARCH_PAGE') {
          extractionLog.push('search')

          return await new Promise((resolve) => {
            resolveSearchPage = resolve
          })
        }

        if (typedMessage.type === 'EXTENSION_EXTRACT_DETAIL_PAGE') {
          extractionLog.push('detail')
        }

        throw new Error(`Unhandled tab message ${(typedMessage as { type: string }).type}`)
      },
    })
    vi.stubGlobal('chrome', chromeMock.chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const path = new URL(url).pathname
        fetchPaths.push(path)

        if (path === '/api/admin/scraper-extension/auth') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: 'user_1',
                email: 'captain@example.com',
                name: 'Captain',
              },
              imageUploadEnabled: true,
              uploadEndpoint: 'https://boat-search.nard.uk/upload',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/start') {
          return new Response(
            JSON.stringify({
              pipelineId: 11,
              jobId: 22,
              startedAt: '2026-03-30T17:10:00.000Z',
              existingBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
              refreshableBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/fail') {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        if (
          path === '/api/admin/scraper-extension/run/listing' ||
          path === '/api/admin/scraper-extension/run/stop'
        ) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        throw new Error(`Unhandled fetch path ${path}`)
      }),
    )

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })
    await extension.loadSession()

    extension.session.value.connection.apiKey = 'nk_test'
    extension.session.value.connection.apiKeySource = 'manual'
    extension.session.value.connection.verifiedAt = new Date().toISOString()
    extension.session.value.connection.verifiedEmail = 'captain@example.com'
    extension.session.value.preset.appliedPresetId = 'yachtworld-search'
    extension.session.value.preset.appliedPresetLabel = 'YachtWorld Search'
    extension.session.value.currentTabUrl = searchPageUrl
    extension.session.value.draft.name = 'YachtWorld test'
    extension.session.value.draft.boatSource = 'YachtWorld'
    extension.session.value.draft.config.startUrls = [searchPageUrl]
    extension.session.value.draft.config.allowedDomains = ['www.yachtworld.com']
    extension.session.value.draft.config.itemSelector = '.listing-card'
    extension.session.value.draft.config.nextPageSelector = 'a.next'
    extension.session.value.draft.config.maxPages = 1
    extension.session.value.draft.config.maxItemsPerRun = 10
    extension.session.value.draft.config.fetchDetailPages = true

    await flushSessionWatchers()

    const runPromise = extension.startScrapeInBoatSearch()
    for (let attempt = 0; attempt < 5 && !resolveSearchPage; attempt += 1) {
      await flushSessionWatchers()
    }

    expect(resolveSearchPage).not.toBeNull()

    extension.stopScrapeInBoatSearch()

    resolveSearchPage?.({
      pageUrl: searchPageUrl,
      itemCount: 1,
      nextPageUrl: null,
      warnings: [],
      analysis: {
        pageType: 'search',
        pageState: 'ok',
        stateMessage: null,
        siteName: 'YachtWorld',
        pageUrl: searchPageUrl,
        itemSelector: '.listing-card',
        nextPageSelector: 'a.next',
        sampleDetailUrl: detailUrl,
        fields: [],
        warnings: [],
        stats: {
          detailLinkCount: 1,
          listingCardCount: 1,
          distinctImageCount: 1,
        },
      },
      records: [
        {
          source: 'YachtWorld',
          url: detailUrl,
          listingId: '123',
          title: 'Cancel Me',
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
      ],
    })

    await runPromise

    expect(extractionLog).toEqual(['search'])
    expect(fetchPaths).toContain('/api/admin/scraper-extension/run/fail')
    expect(extension.errorMessage.value).toBe('')
    expect(extension.statusMessage.value).toBe('Browser scrape stopped.')
    expect(extension.browserRunProgress.value).toBeNull()
  })

  it('retries weak detail pages after the main search pass completes', async () => {
    const searchPageUrl = 'https://www.yachtworld.com/boats-for-sale/type-power/page-1/'
    const detailUrl = 'https://www.yachtworld.com/yacht/retry-me-789/'

    const navigationLog: string[] = []
    const extractionLog: string[] = []
    const persistedDescriptions: Array<string | null> = []
    let detailAttempts = 0

    const chromeMock = createChromeMock(undefined, {
      activeTab: {
        id: 8,
        url: searchPageUrl,
        status: 'complete',
        active: true,
      },
      updateTab: async (tabId, properties) => {
        const nextUrl = properties.url ?? searchPageUrl
        navigationLog.push(nextUrl)

        return {
          id: tabId,
          url: nextUrl,
          status: 'complete',
          active: true,
        }
      },
      sendTabMessage: async (_tabId, message) => {
        const typedMessage = message as { type: string }

        if (typedMessage.type === 'EXTENSION_EXTRACT_SEARCH_PAGE') {
          extractionLog.push(`search:${searchPageUrl}`)

          return {
            pageUrl: searchPageUrl,
            itemCount: 1,
            nextPageUrl: null,
            warnings: [],
            analysis: {
              pageType: 'search',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: searchPageUrl,
              itemSelector: '.listing-card',
              nextPageSelector: 'a.next',
              sampleDetailUrl: detailUrl,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 1,
                listingCardCount: 1,
                distinctImageCount: 1,
              },
            },
            records: [
              {
                source: 'YachtWorld',
                url: detailUrl,
                listingId: '789',
                title: 'Retry Boat',
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
            ],
          }
        }

        if (typedMessage.type === 'EXTENSION_EXTRACT_DETAIL_PAGE') {
          detailAttempts += 1
          extractionLog.push(`detail:${detailUrl}:attempt-${detailAttempts}`)

          if (detailAttempts === 1) {
            return {
              pageUrl: detailUrl,
              warnings: [],
              analysis: {
                pageType: 'detail',
                pageState: 'ok',
                stateMessage: null,
                siteName: 'YachtWorld',
                pageUrl: detailUrl,
                itemSelector: '',
                nextPageSelector: '',
                sampleDetailUrl: null,
                fields: [],
                warnings: [],
                stats: {
                  detailLinkCount: 0,
                  listingCardCount: 0,
                  distinctImageCount: 1,
                },
              },
              record: {
                description: null,
                images: [],
              },
            }
          }

          return {
            pageUrl: detailUrl,
            warnings: [],
            analysis: {
              pageType: 'detail',
              pageState: 'ok',
              stateMessage: null,
              siteName: 'YachtWorld',
              pageUrl: detailUrl,
              itemSelector: '',
              nextPageSelector: '',
              sampleDetailUrl: null,
              fields: [],
              warnings: [],
              stats: {
                detailLinkCount: 0,
                listingCardCount: 0,
                distinctImageCount: 4,
              },
            },
            record: {
              description: 'Retried detail page',
              features: 'Hardtop | Livewell',
              images: [
                'https://images.yachtworld.com/example-1.jpg',
                'https://images.yachtworld.com/example-2.jpg',
              ],
            },
          }
        }

        throw new Error(`Unhandled tab message ${(typedMessage as { type: string }).type}`)
      },
    })
    vi.stubGlobal('chrome', chromeMock.chrome)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const path = new URL(url).pathname

        if (path === '/api/admin/scraper-extension/auth') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: {
                id: 'user_1',
                email: 'captain@example.com',
                name: 'Captain',
              },
              imageUploadEnabled: true,
              uploadEndpoint: 'https://boat-search.nard.uk/upload',
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/start') {
          return new Response(
            JSON.stringify({
              pipelineId: 11,
              jobId: 22,
              startedAt: '2026-03-29T10:00:00.000Z',
              existingBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
              refreshableBoatIdentities: {
                listingIds: [],
                normalizedUrls: [],
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/record') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            record?: { description?: string | null }
          }
          persistedDescriptions.push(payload.record?.description ?? null)

          return new Response(
            JSON.stringify({
              inserted: 1,
              updated: 0,
              imagesUploaded: 0,
              warnings: [],
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/progress') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (path === '/api/admin/scraper-extension/run/complete') {
          const payload = JSON.parse(String(init?.body ?? '{}')) as {
            jobId: number
            summary: Record<string, unknown>
            inserted: number
            updated: number
          }

          return new Response(
            JSON.stringify({
              jobId: payload.jobId,
              summary: {
                ...payload.summary,
                inserted: payload.inserted,
                updated: payload.updated,
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        if (
          path === '/api/admin/scraper-extension/run/listing' ||
          path === '/api/admin/scraper-extension/run/stop'
        ) {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        throw new Error(`Unhandled fetch path ${path}`)
      }),
    )

    let extension!: ReturnType<typeof useExtensionSession>
    scope = effectScope()
    scope.run(() => {
      extension = useExtensionSession()
    })

    extension.session.value.connection.apiKey = 'nk_test'
    extension.session.value.connection.apiKeySource = 'manual'
    extension.session.value.preset.appliedPresetId = 'yachtworld-search'
    extension.session.value.preset.appliedPresetLabel = 'YachtWorld Search'
    extension.session.value.currentTabUrl = searchPageUrl
    extension.session.value.draft.name = 'YachtWorld retry test'
    extension.session.value.draft.boatSource = 'YachtWorld'
    extension.session.value.draft.config.startUrls = [searchPageUrl]
    extension.session.value.draft.config.allowedDomains = ['www.yachtworld.com']
    extension.session.value.draft.config.itemSelector = '.listing-card'
    extension.session.value.draft.config.nextPageSelector = 'a.next'
    extension.session.value.draft.config.maxPages = 1
    extension.session.value.draft.config.maxItemsPerRun = 10
    extension.session.value.draft.config.fetchDetailPages = true

    await flushSessionWatchers()
    await extension.startScrapeInBoatSearch()

    expect(extractionLog).toEqual([
      `search:${searchPageUrl}`,
      `detail:${detailUrl}:attempt-1`,
      `detail:${detailUrl}:attempt-2`,
    ])
    expect(persistedDescriptions).toEqual([null, 'Retried detail page'])
    expect(navigationLog).toEqual([searchPageUrl, detailUrl, detailUrl])
    expect(extension.errorMessage.value).toBe('')
  })
})
