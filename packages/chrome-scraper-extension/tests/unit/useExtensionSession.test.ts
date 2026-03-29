import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultSession } from '@/shared/defaults'
import { useExtensionSession } from '@/sidepanel/composables/useExtensionSession'

const STORAGE_KEY = 'boat-search-extension-session-v3'

type ListenerApi = {
  addListener: ReturnType<typeof vi.fn>
  removeListener: ReturnType<typeof vi.fn>
}

type ChromeStorageState = Record<string, unknown>

function createListenerApi(): ListenerApi {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }
}

function createChromeMock(storedSession?: unknown) {
  const storageState: ChromeStorageState = {}
  if (storedSession !== undefined) {
    storageState[STORAGE_KEY] = structuredClone(storedSession)
  }

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
        query: vi.fn(async () => []),
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
})
