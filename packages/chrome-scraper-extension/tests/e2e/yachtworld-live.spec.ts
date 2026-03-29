import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test'
import { loginAsAdmin } from '../../../../apps/web/tests/e2e/fixtures.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const extensionDistPath = resolve(__dirname, '..', '..', 'dist')
const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const defaultYachtWorldUrl =
  'https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/placeId-AQADAFMANqlqI458DeEXlNRu8OKkS2V1BUeGQTA--5f27c3g4ulAR8J6RuGm8-wDOKdAQkRAUojabmjNJLLG2ZhjMVY_Sa2m4-BkouNJTagfzL3YA3cdpJodOztaUg0QUZMlEhPvtwjFhiPxdJ5av8ft-k5Hb_odNg/radius-200/price-100000,500000/'

type DebugEvent = {
  type: string
  at: string
  message: string
  detail?: Record<string, unknown>
}

type DebugSnapshot = {
  statusMessage: string
  errorMessage: string
  analysis: {
    pageType: 'search' | 'detail' | 'unknown'
    pageState: 'ok' | 'challenge' | 'no_results' | 'parser_changed'
    pageUrl: string
    itemSelector: string
    nextPageSelector: string
    sampleDetailUrl: string | null
    stateMessage: string | null
    stats: {
      detailLinkCount: number
      listingCardCount: number
      distinctImageCount: number
    }
  } | null
  sampleDetailRun: {
    status: 'opening' | 'opened' | 'scanned' | 'error'
    url: string | null
    fieldCount: number
    imageCount: number
    message: string
  } | null
  browserRunProgress: {
    stage: 'search' | 'detail' | 'upload'
    pagesVisited: number
    itemsSeen: number
    itemsExtracted: number
    detailPagesCompleted: number
    detailPagesTotal: number
    recordsPersisted: number
    imagesUploaded: number
    currentUrl: string | null
  } | null
  remoteRun: {
    pipelineId: number
    jobId: number | null
    summary: {
      pagesVisited: number
      itemsSeen: number
      itemsExtracted: number
      inserted: number
      updated: number
      warnings: string[]
    }
  } | null
  events: DebugEvent[]
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `Set ${name} before running the live YachtWorld harness. This test is local-only and uses your seeded Chrome profile.`,
    )
  }

  return value
}

async function launchChromeWithExtension() {
  const userDataDir = getRequiredEnv('EXTENSION_E2E_CHROME_USER_DATA_DIR')
  const profileDir = getRequiredEnv('EXTENSION_E2E_CHROME_PROFILE_DIR')

  try {
    return await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromeExecutablePath,
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      viewport: { width: 1600, height: 1200 },
      args: [
        `--profile-directory=${profileDir}`,
        `--disable-extensions-except=${extensionDistPath}`,
        `--load-extension=${extensionDistPath}`,
      ],
    })
  } catch (error: unknown) {
    throw new Error(
      error instanceof Error
        ? `Could not launch Google Chrome with the seeded profile. Close any Chrome instance using that profile and try again. Original error: ${error.message}`
        : 'Could not launch Google Chrome with the seeded profile.',
    )
  }
}

async function resolveExtensionId(context: BrowserContext) {
  let worker = context.serviceWorkers()[0]
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 30_000 })
  }

  return new URL(worker.url()).host
}

async function setInputValue(page: Page, testId: string, value: string) {
  await page.evaluate(
    ({ testId, value }) => {
      const selector = `[data-testid="${testId}"]`
      const input = document.querySelector(selector)
      if (!(input instanceof HTMLInputElement)) {
        throw new Error(`Could not find input ${selector}.`)
      }

      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { testId, value },
  )
}

async function clickByTestId(page: Page, testId: string) {
  await page.evaluate((target) => {
    const button = document.querySelector(`[data-testid="${target}"]`)
    if (!(button instanceof HTMLElement)) {
      throw new Error(`Could not find clickable element [data-testid="${target}"].`)
    }

    button.click()
  }, testId)
}

async function readDebugSnapshot(page: Page) {
  return await page.evaluate(() => {
    return (
      (window as Window & { __BOAT_SEARCH_EXTENSION_DEBUG__?: DebugSnapshot })
        .__BOAT_SEARCH_EXTENSION_DEBUG__ || null
    )
  })
}

async function waitForDebugSnapshot(
  page: Page,
  predicate: (snapshot: DebugSnapshot) => boolean,
  options?: { timeoutMs?: number; label?: string },
) {
  const timeoutMs = options?.timeoutMs ?? 30_000
  const label = options?.label ?? 'extension debug state'
  const deadline = Date.now() + timeoutMs
  let lastSnapshot: DebugSnapshot | null = null

  while (Date.now() < deadline) {
    const snapshot = await readDebugSnapshot(page)
    if (snapshot) {
      lastSnapshot = snapshot
      if (predicate(snapshot)) {
        return snapshot
      }
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`Timed out waiting for ${label}. Last snapshot: ${JSON.stringify(lastSnapshot)}`)
}

async function createApiKey(page: Page) {
  return await page.evaluate(async () => {
    const response = await fetch('/api/auth/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ name: `YachtWorld live validation ${Date.now()}` }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }

    const payload = (await response.json()) as { rawKey: string }
    return payload.rawKey
  })
}

async function attachConsole(page: Page, bucket: string[]) {
  page.on('console', (message) => {
    bucket.push(`[${message.type()}] ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    bucket.push(`[pageerror] ${error.message}`)
  })
}

async function writeArtifacts(
  testInfo: TestInfo,
  extensionPage: Page,
  yachtPage: Page,
  snapshot: DebugSnapshot | null,
  extensionConsole: string[],
  yachtConsole: string[],
) {
  await extensionPage.screenshot({
    path: testInfo.outputPath('extension-final.png'),
    fullPage: true,
  })
  await yachtPage.screenshot({
    path: testInfo.outputPath('yachtworld-final.png'),
    fullPage: true,
  })
  await writeFile(
    testInfo.outputPath('extension-debug.json'),
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    testInfo.outputPath('extension-console.log'),
    `${extensionConsole.join('\n')}\n`,
    'utf8',
  )
  await writeFile(
    testInfo.outputPath('yachtworld-console.log'),
    `${yachtConsole.join('\n')}\n`,
    'utf8',
  )
}

test('validates the YachtWorld extension flow against a seeded Chrome profile', async ({ baseURL }, testInfo) => {
  const yachtWorldUrl = process.env.EXTENSION_E2E_YACHTWORLD_URL?.trim() || defaultYachtWorldUrl
  const context = await launchChromeWithExtension()
  const extensionConsole: string[] = []
  const yachtConsole: string[] = []
  let extensionPage: Page | null = null
  let yachtPage: Page | null = null

  try {
    const extensionId = await resolveExtensionId(context)

    const appPage = await context.newPage()
    await appPage.goto(baseURL || 'http://localhost:3000', { waitUntil: 'domcontentloaded' })
    await loginAsAdmin(appPage)
    const apiKey = await createApiKey(appPage)

    extensionPage = await context.newPage()
    await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
      waitUntil: 'domcontentloaded',
    })
    await attachConsole(extensionPage, extensionConsole)
    await extensionPage.evaluate(async () => {
      await chrome.storage.local.clear()
    })
    await extensionPage.reload({ waitUntil: 'domcontentloaded' })
    await extensionPage.waitForSelector('[data-testid="api-key-input"]')
    await setInputValue(extensionPage, 'app-base-url-input', baseURL || 'http://localhost:3000')
    await setInputValue(extensionPage, 'api-key-input', apiKey)
    await clickByTestId(extensionPage, 'workflow-step-pagination')
    await extensionPage.waitForSelector('[data-testid="max-pages-input"]')
    await setInputValue(extensionPage, 'max-pages-input', '2')
    await setInputValue(extensionPage, 'max-items-per-run-input', '120')
    await clickByTestId(extensionPage, 'connection-test-button')
    await expect(extensionPage.getByTestId('toolbar-status')).toContainText('Connected to Boat Search')

    yachtPage = await context.newPage()
    await attachConsole(yachtPage, yachtConsole)
    await yachtPage.goto(yachtWorldUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    })
    await yachtPage.waitForTimeout(5_000)
    await yachtPage.bringToFront()

    await clickByTestId(extensionPage, 'scan-current-page')
    let snapshot = await waitForDebugSnapshot(
      extensionPage,
      (state) => Boolean(state.analysis),
      { timeoutMs: 45_000, label: 'initial YachtWorld analysis' },
    )

    if (snapshot.analysis?.pageState === 'challenge') {
      await writeArtifacts(testInfo, extensionPage, yachtPage, snapshot, extensionConsole, yachtConsole)
      expect(snapshot.analysis.stateMessage || '').toMatch(/challenge|cloudflare|verification/i)
      return
    }

    expect(snapshot.analysis?.pageType).toBe('search')
    expect(snapshot.analysis?.pageState).toBe('ok')
    expect(snapshot.analysis?.itemSelector).toBeTruthy()
    expect(snapshot.analysis?.sampleDetailUrl).toBeTruthy()
    expect(snapshot.analysis?.nextPageSelector).toBeTruthy()
    await expect(extensionPage.getByTestId('pagination-auto-detected')).toBeVisible()

    await clickByTestId(extensionPage, 'open-sample-detail-button')
    snapshot = await waitForDebugSnapshot(
      extensionPage,
      (state) =>
        state.sampleDetailRun?.status === 'scanned' || state.sampleDetailRun?.status === 'error',
      { timeoutMs: 60_000, label: 'sample detail auto-scan result' },
    )

    if (snapshot.sampleDetailRun?.status !== 'scanned') {
      await writeArtifacts(testInfo, extensionPage, yachtPage, snapshot, extensionConsole, yachtConsole)
      expect(snapshot.sampleDetailRun?.message || '').not.toMatch(/server error/i)
      expect(snapshot.sampleDetailRun?.message || '').toMatch(/detail|challenge|stable|cloudflare/i)
      return
    }

    expect(snapshot.sampleDetailRun.imageCount).toBeGreaterThan(1)
    await expect(extensionPage.getByTestId('sample-detail-status')).toContainText('opened and scanned')
    await expect(extensionPage.getByTestId('detail-image-count')).toContainText('Detected')

    await clickByTestId(extensionPage, 'workflow-step-detail-fields-export')
    await extensionPage.waitForSelector('[data-testid="start-browser-scrape-button"]')
    await clickByTestId(extensionPage, 'start-browser-scrape-button')

    snapshot = await waitForDebugSnapshot(
      extensionPage,
      (state) =>
        state.events.some((event) => event.type === 'browser-scrape-complete') ||
        state.events.some((event) => event.type === 'browser-scrape-failed'),
      { timeoutMs: 5 * 60_000, label: 'browser scrape completion' },
    )

    await writeArtifacts(testInfo, extensionPage, yachtPage, snapshot, extensionConsole, yachtConsole)

    const finalEvent = [...snapshot.events]
      .reverse()
      .find((event) => event.type === 'browser-scrape-complete' || event.type === 'browser-scrape-failed')

    if (finalEvent?.type === 'browser-scrape-failed') {
      expect(finalEvent.message).not.toMatch(/server error/i)
      expect(finalEvent.message).toMatch(
        /challenge|listing cards|listing urls|no matching listings|detail page|cloudflare/i,
      )
      return
    }

    expect(snapshot.remoteRun?.summary.itemsSeen || 0).toBeGreaterThan(0)
    expect(snapshot.remoteRun?.summary.itemsExtracted || 0).toBeGreaterThan(0)
    expect(snapshot.remoteRun?.summary.pagesVisited || 0).toBeGreaterThanOrEqual(2)
    expect(snapshot.remoteRun?.summary.inserted || 0 + (snapshot.remoteRun?.summary.updated || 0)).toBeGreaterThanOrEqual(0)
  } finally {
    if (extensionPage && yachtPage) {
      const finalSnapshot = await readDebugSnapshot(extensionPage).catch(() => null)
      await writeArtifacts(testInfo, extensionPage, yachtPage, finalSnapshot, extensionConsole, yachtConsole).catch(
        () => {},
      )
    }

    await context.close()
  }
})
