import {
  classifyGenericSignal,
  makePageState,
  PAGE_STATES,
  readPageSignal,
} from '../page-state.mjs'

/** Pagination stops when there is no next link, not at an arbitrary page count. */
const UNLIMITED_PAGES = Number.MAX_SAFE_INTEGER
const DEFAULT_MAX_REQUESTS_PER_CRAWL = 50_000_000

function parseMaxPagesEnv(env) {
  const raw = env.MAX_PAGES
  if (raw === undefined || raw === '' || raw === '0') {
    return UNLIMITED_PAGES
  }
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) {
    return UNLIMITED_PAGES
  }
  return n
}

function parseMaxRequestsPerCrawl(env, maxPages, streamCount) {
  const raw = env.MAX_REQUESTS_PER_CRAWL
  if (raw !== undefined && raw !== '') {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) {
      return n
    }
  }
  if (maxPages >= 1_000_000_000) {
    return DEFAULT_MAX_REQUESTS_PER_CRAWL
  }
  const product = maxPages * streamCount * 3
  if (!Number.isFinite(product) || product > DEFAULT_MAX_REQUESTS_PER_CRAWL) {
    return DEFAULT_MAX_REQUESTS_PER_CRAWL
  }
  return Math.max(product, 800)
}

const BLOCK_TITLE_SUBSTRINGS = [
  'just a moment',
  'moment please',
  'verify',
  'verification',
  'challenge',
  'checking your browser',
  'access denied',
  '403',
  'forbidden',
  'attention required',
  'cloudflare',
  'please wait',
  'enable javascript',
]

export const yachtWorldSource = {
  key: 'yachtworld',
  displayName: 'YachtWorld',
  dbSourceName: 'yachtworld.com',
  parserVersion: '2026-03-27-yachtworld-v1',
  fallbackStrategy: 'stop source and use an authorized feed or manual review',
  policyStatus: 'allow',
  allowedHosts: ['www.yachtworld.com', 'yachtworld.com'],
  rateBudget: {
    defaultMinDelayMs: 2_500,
    jitterMs: 900,
  },

  getRuntime(env) {
    const lengthMin = parseInt(env.LENGTH_MIN || '20', 10)
    const lengthMax = parseInt(env.LENGTH_MAX || '60', 10)
    const maxPrice = parseInt(env.MAX_PRICE || '1000000', 10)
    const searchClasses = [
      'power-sportfish',
      'power-sport-fishing',
      'power-center-console',
      'power-walkaround',
      'power-bay',
      'power-flats',
      'power-fishing',
      'power-convertible',
      'power-express',
    ]

    const maxPages = parseMaxPagesEnv(env)

    return {
      headless: env.HEADLESS !== 'false',
      maxPages,
      maxConcurrency: parseInt(env.MAX_CONCURRENCY || '2', 10),
      maxRequestsPerCrawl: parseMaxRequestsPerCrawl(env, maxPages, searchClasses.length),
      requestHandlerTimeoutSecs: 120,
      launchArgs: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
      ],
      maxPrice,
      searchContext: {
        lengthMin,
        lengthMax,
        searchType: 'fishing',
        searchLocation: 'US',
      },
      searchUrls: searchClasses.map(
        (cls) =>
          `https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-${cls}/length-${lengthMin},${lengthMax}/price-${parseInt(env.MIN_PRICE || '50000', 10)},${maxPrice}/`,
      ),
    }
  },

  buildSearchRequests(runtime) {
    return runtime.searchUrls.map((url) => ({
      url,
      userData: {
        pageIndex: 1,
        streamSeed: url,
      },
    }))
  },

  isDetailUrl(url) {
    return url.includes('/yacht/')
  },

  async detectBlockState({ page, isDetail }) {
    await settleYachtWorldPage({ page, isDetail })

    const signal = await readPageSignal(page)
    const state = classifyYachtWorldSignal(signal, { isDetail })

    if (state.state === PAGE_STATES.OK) {
      if (isDetail) {
        const hasHeading = await page
          .locator('h1')
          .first()
          .isVisible()
          .catch(() => false)
        if (!hasHeading) {
          return makePageState(PAGE_STATES.PARSER_CHANGED, {
            summary: 'YachtWorld detail page never exposed a heading',
            signal,
          })
        }
      } else {
        const listingCount = await page
          .locator('a[href*="/yacht/"]')
          .count()
          .catch(() => 0)
        if (listingCount === 0) {
          return makePageState(PAGE_STATES.PARSER_CHANGED, {
            summary: 'YachtWorld search page had no listing links after settle',
            signal,
          })
        }
      }
    }

    return makePageState(state.state, {
      reason: state.reason,
      summary: state.summary,
      signal,
    })
  },

  async discoverListings({ request, page, runtime }) {
    const pageIndex = request.userData?.pageIndex || 1
    const streamSeed = request.userData?.streamSeed || request.url

    for (let index = 0; index < 8; index += 1) {
      await page.evaluate(() => window.scrollBy(0, 650)).catch(() => {})
      await page.waitForTimeout(350)
    }
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})

    const listings = await page.evaluate(() => {
      const results = []
      const seen = new Set()
      const anchors = [...document.querySelectorAll('a[href*="/yacht/"]')]

      function normalizeListingUrl(href) {
        try {
          const url = new URL(href, 'https://www.yachtworld.com')
          const path = url.pathname.replace(/\/+$/, '')
          const match = path.match(/\/yacht\/(.+)-(\d+)$/)
          if (!match) return null
          return `https://www.yachtworld.com/yacht/${match[1]}-${match[2]}/`
        } catch {
          return null
        }
      }

      for (const link of anchors) {
        const href = link.href || link.getAttribute('href')
        if (!href) continue
        const canonical = normalizeListingUrl(href)
        if (!canonical || seen.has(canonical)) continue
        seen.add(canonical)
        results.push({
          url: canonical,
          searchText: link.textContent?.trim()?.slice(0, 160) || '',
        })
      }

      return results
    })

    const nextUrl =
      pageIndex < runtime.maxPages
        ? await page.evaluate(() => {
            const relNext = document.querySelector('a[rel="next"]')
            if (relNext?.href) return relNext.href

            const ariaNext = document.querySelector(
              'a[aria-label*="ext" i], a[aria-label*="Next" i]',
            )
            if (ariaNext?.href && !/prev/i.test(ariaNext.getAttribute('aria-label') || '')) {
              return ariaNext.href
            }

            return null
          })
        : null

    return {
      detailRequests: listings.map((listing) => ({
        url: listing.url,
        userData: {
          searchListing: listing,
          streamSeed,
        },
      })),
      searchRequests: nextUrl
        ? [
            {
              url: nextUrl,
              userData: {
                pageIndex: pageIndex + 1,
                streamSeed,
              },
            },
          ]
        : [],
    }
  },

  async extractDetail({ request, page, runtime }) {
    await page.waitForSelector('h1', { timeout: 20_000 }).catch(() => {})

    return page.evaluate(
      ({ sourceUrl, lenMin, lenMax }) => {
        const getText = (selector) => document.querySelector(selector)?.textContent?.trim() || null
        const getMeta = (property) =>
          document
            .querySelector(`meta[property="${property}"], meta[name="${property}"]`)
            ?.getAttribute('content')
            ?.trim() || null

        let ld = null
        for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const parsed = JSON.parse(node.textContent || '')
            const stack = Array.isArray(parsed) ? parsed : [parsed]
            for (const item of stack) {
              if (item && typeof item === 'object' && item['@graph']) {
                for (const graphItem of item['@graph']) {
                  if (graphItem && (graphItem.name || graphItem.offers)) {
                    ld = graphItem
                    break
                  }
                }
              } else if (item && (item.name || item.offers)) {
                ld = item
                break
              }
            }
            if (ld) break
          } catch {
            // Ignore malformed LD+JSON.
          }
        }

        const title = getText('h1') || ld?.name || ''
        const titleMatch = title.match(/^(\d{4})?\s*(.+)/)
        const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null
        const makeModel = titleMatch?.[2]?.trim() || ''
        const parts = makeModel.split(/\s+/).filter(Boolean)
        const make = parts[0] || null
        const model = parts.slice(1).join(' ') || null

        let price = null
        let currency = 'USD'
        const offer = ld?.offers
        const offerPrice =
          (typeof offer === 'object' && offer !== null && !Array.isArray(offer)
            ? offer.price
            : null) ||
          (Array.isArray(offer) && offer[0]?.price) ||
          null
        if (offerPrice != null) {
          price =
            String(offerPrice)
              .replace(/[^\d.]/g, '')
              .split('.')[0] || null
          const offerCurrency =
            (typeof offer === 'object' &&
              offer !== null &&
              !Array.isArray(offer) &&
              offer.priceCurrency) ||
            (Array.isArray(offer) && offer[0]?.priceCurrency)
          if (offerCurrency) currency = String(offerCurrency)
        }

        let length = null
        const titleLengthMatch = makeModel.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:ft|')\b/i)
        if (titleLengthMatch) {
          length = String(parseFloat(titleLengthMatch[1]))
        }
        if (!length) {
          const genericMatch = makeModel.match(/\b(\d{1,2})\b/)
          if (genericMatch) {
            const parsed = parseInt(genericMatch[1], 10)
            if (parsed >= lenMin && parsed <= lenMax) {
              length = String(parsed)
            }
          }
        }

        let location =
          getMeta('og:locality') ||
          ld?.location?.address?.addressLocality ||
          getText('[class*="location" i]') ||
          ''

        const locParts = (location || '')
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
        const city = locParts[0] || null
        const state = locParts.length >= 2 ? locParts[locParts.length - 1] : null

        const description =
          getText('[class*="description" i], [class*="detail-text" i], article p') ||
          String(ld?.description || '')

        const images = [
          ...new Set(
            [
              ...document.querySelectorAll(
                'img[src*="yachtworld"], img[src*="boats"], picture source[srcset]',
              ),
            ]
              .map((img) => img.currentSrc || img.src || img.getAttribute('srcset') || '')
              .flatMap((value) => value.split(',').map((part) => part.trim().split(/\s+/)[0]))
              .filter(
                (src) =>
                  src.startsWith('http') && !/placeholder|spinner|logo|icon|1x1|blank/i.test(src),
              )
              .map((src) => src.split('?')[0]),
          ),
        ].slice(0, 24)

        const idMatch = sourceUrl.match(/-(\d+)\/?(?:\?|$)/)
        const listingId = idMatch ? `yw-${idMatch[1]}` : null

        return {
          listingId,
          url: sourceUrl,
          source: 'yachtworld.com',
          make,
          model,
          year,
          length,
          price,
          currency,
          location: location || null,
          city,
          state,
          country: 'US',
          description: description.slice(0, 5000),
          sellerType: /private\s+seller|by\s+owner/i.test(description)
            ? 'Private Seller'
            : 'Dealer',
          listingType: 'Used',
          images,
          fullText: `${title} ${description}`.slice(0, 4000),
          scrapedAt: new Date().toISOString(),
        }
      },
      {
        sourceUrl: request.url,
        lenMin: runtime.searchContext.lengthMin,
        lenMax: runtime.searchContext.lengthMax,
      },
    )
  },

  acceptBoatData(boatData, runtime) {
    if (!boatData.url || (!boatData.make && !boatData.model)) {
      return {
        accepted: false,
        pageState: PAGE_STATES.PARSER_CHANGED,
        reason: 'Missing YachtWorld make/model or URL on detail page',
      }
    }

    const length = parseFloat(boatData.length || '0')
    if (
      length > 0 &&
      (length < runtime.searchContext.lengthMin || length > runtime.searchContext.lengthMax)
    ) {
      return { accepted: false, reason: `Length ${length}ft outside configured range` }
    }

    const price = parseInt(boatData.price || '0', 10)
    if (price > runtime.maxPrice) {
      return { accepted: false, reason: `Price $${price.toLocaleString()} over budget` }
    }

    return { accepted: true }
  },
}

export function classifyYachtWorldSignal(signal) {
  const generic = classifyGenericSignal(signal)
  if (generic.state !== PAGE_STATES.OK) {
    return generic
  }

  const title = (signal.title || '').toLowerCase()
  const body = (signal.bodyText || '').toLowerCase()
  const html = (signal.html || '').toLowerCase()

  if (BLOCK_TITLE_SUBSTRINGS.some((needle) => title.includes(needle))) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: 'YachtWorld exposed a challenge/interstitial title',
    })
  }

  if (
    html.includes('__cf_chl') ||
    html.includes('challenges.cloudflare.com/turnstile') ||
    /checking your browser|just a moment/i.test(`${title}\n${body}`)
  ) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: 'YachtWorld exposed Cloudflare challenge markers',
    })
  }

  if (/no boats match|no results|0 results|no listings found/i.test(body)) {
    return makePageState(PAGE_STATES.NO_RESULTS, {
      summary: 'YachtWorld reported no results',
    })
  }

  return makePageState(PAGE_STATES.OK)
}

async function settleYachtWorldPage({ page, isDetail }) {
  await page.waitForLoadState('domcontentloaded', { timeout: 25_000 }).catch(() => {})
  await dismissConsent(page)

  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const signal = await readPageSignal(page)
    const state = classifyYachtWorldSignal(signal, { isDetail })

    if (state.state === PAGE_STATES.NO_RESULTS || state.state === PAGE_STATES.CHALLENGE_OR_BLOCK) {
      return
    }

    if (isDetail) {
      const ok = await page
        .locator('h1')
        .first()
        .isVisible()
        .catch(() => false)
      if (ok) return
    } else {
      const count = await page
        .locator('a[href*="/yacht/"]')
        .count()
        .catch(() => 0)
      if (count > 0) return
    }

    await page.waitForTimeout(900)
    await dismissConsent(page)
  }
}

async function dismissConsent(page) {
  const selectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("I Accept")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    '[aria-label="Accept"]',
    'button:has-text("Continue")',
  ]

  for (const selector of selectors) {
    const locator = page.locator(selector).first()
    if (await locator.isVisible({ timeout: 600 }).catch(() => false)) {
      await locator.click({ timeout: 2_500 }).catch(() => {})
      await page.waitForTimeout(400)
      break
    }
  }
}
