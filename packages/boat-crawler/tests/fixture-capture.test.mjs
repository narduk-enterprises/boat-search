import assert from 'assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildConsoleCaptureSnippet,
  CAPTURE_PAYLOAD_SCHEMA,
  classifyClipboardContent,
  extractYachtWorldDetailUrlsFromHtml,
  parseCapturedPayload,
  waitForClipboardPayload,
} from '../src/fixture-capture.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadFixture(...parts) {
  return readFileSync(join(__dirname, 'fixtures', ...parts), 'utf8')
}

function createPayload(overrides = {}) {
  return {
    schema: CAPTURE_PAYLOAD_SCHEMA,
    capturedAt: '2026-03-29T08:04:43.911Z',
    page: {
      url: 'https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/price-100000,500000/?',
      title: 'Used Saltwater Fishing boats for sale | YachtWorld',
      host: 'www.yachtworld.com',
      readyState: 'complete',
      viewport: {
        width: 1600,
        height: 1200,
        scrollX: 0,
        scrollY: 0,
        scrollWidth: 1600,
        scrollHeight: 2400,
        clientWidth: 1600,
        clientHeight: 1200,
      },
    },
    stats: {
      anchorCount: 32,
      imageCount: 8,
      textLength: 2048,
    },
    html: '<!doctype html><html><head><title>Fixture</title></head><body><a href="https://www.yachtworld.com/yacht/example-boat-1234567/">Detail</a></body></html>',
    ...overrides,
  }
}

test('parseCapturedPayload accepts valid capture payloads', () => {
  const payload = createPayload()
  const parsed = parseCapturedPayload(JSON.stringify(payload))

  assert.equal(parsed.schema, CAPTURE_PAYLOAD_SCHEMA)
  assert.equal(parsed.page.url, payload.page.url)
})

test('classifyClipboardContent distinguishes the injected snippet from captured payloads', () => {
  const snippet = buildConsoleCaptureSnippet()
  const payload = createPayload()

  assert.equal(classifyClipboardContent(snippet, snippet).state, 'snippet')
  assert.equal(classifyClipboardContent(JSON.stringify(payload), snippet).state, 'payload')
  assert.equal(classifyClipboardContent('not valid json', snippet).state, 'other')
})

test('waitForClipboardPayload keeps polling while the clipboard still contains the injected snippet', async () => {
  const snippet = buildConsoleCaptureSnippet()
  const payload = createPayload()
  let reads = 0

  const resolved = await waitForClipboardPayload({
    snippet,
    timeoutMs: 100,
    pollIntervalMs: 1,
    readClipboardImpl: async () => {
      reads += 1
      return reads < 3 ? snippet : JSON.stringify(payload)
    },
  })

  assert.equal(resolved.page.url, payload.page.url)
  assert.equal(reads, 3)
})

test('waitForClipboardPayload times out with a stale-snippet message when the clipboard never changes', async () => {
  const snippet = buildConsoleCaptureSnippet()

  await assert.rejects(
    () =>
      waitForClipboardPayload({
        snippet,
        timeoutMs: 20,
        pollIntervalMs: 1,
        readClipboardImpl: async () => snippet,
      }),
    /clipboard still contains the injected snippet/i,
  )
})

test('extractYachtWorldDetailUrlsFromHtml returns unique normalized detail URLs', () => {
  const html = loadFixture('yachtworld', 'search-ok.html')
  const detailUrls = extractYachtWorldDetailUrlsFromHtml(html)

  assert.ok(detailUrls.length > 0)
  assert.equal(detailUrls.length, new Set(detailUrls).size)
  assert.ok(detailUrls.every((url) => /^https:\/\/www\.yachtworld\.com\/yacht\//.test(url)))
})
