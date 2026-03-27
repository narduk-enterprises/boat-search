import {
  classifyGenericSignal,
  makePageState,
  PAGE_STATES,
  readPageSignal,
} from '../page-state.mjs'
import { normalizeWhitespace } from '../utils.mjs'

export const boattraderSource = {
  key: 'boattrader',
  displayName: 'BoatTrader',
  dbSourceName: 'boattrader.com',
  parserVersion: '2026-03-27-boattrader-v1',
  fallbackStrategy: 'stop source and switch to authorized alternate source or manual review',
  policyStatus: 'allow',
  allowedHosts: ['www.boattrader.com', 'boattrader.com'],
  rateBudget: {
    defaultMinDelayMs: 2_000,
    jitterMs: 700,
  },

  getRuntime(env) {
    const lengthMin = parseInt(env.LENGTH_MIN || '20', 10)
    const lengthMax = parseInt(env.LENGTH_MAX || '60', 10)
    const maxPrice = parseInt(env.MAX_PRICE || '2000000', 10)
    const classes = [
      'sportfish-convertible',
      'sportfish',
      'convertible',
      'center-console',
      'express',
      'walkaround',
      'cuddy-cabin',
    ]

    return {
      headless: env.HEADLESS !== 'false',
      maxPages: parseInt(env.MAX_PAGES || '100', 10),
      maxConcurrency: parseInt(env.MAX_CONCURRENCY || '2', 10),
      maxRequestsPerCrawl: Math.max(parseInt(env.MAX_PAGES || '100', 10) * 5, 500),
      requestHandlerTimeoutSecs: 90,
      launchArgs: ['--disable-blink-features=AutomationControlled'],
      maxPrice,
      searchContext: {
        lengthMin,
        lengthMax,
        searchType: 'convertible',
        searchLocation: 'US',
      },
      searchUrls: classes.map(
        (cls) =>
          `https://www.boattrader.com/boats/type-power/class-${cls}/?length=${lengthMin}-${lengthMax}&price=,${maxPrice}&page=1`,
      ),
    }
  },

  buildSearchRequests(runtime) {
    return runtime.searchUrls.map((url) => ({
      url,
      userData: { pageIndex: 1 },
    }))
  },

  isDetailUrl(url) {
    return url.includes('/listing/') || url.includes('/boat/')
  },

  async detectBlockState({ page, isDetail }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1_500)
    const signal = await readPageSignal(page)
    const state = classifyBoatTraderSignal(signal, { isDetail })
    return makePageState(state.state, {
      reason: state.reason,
      summary: state.summary,
      signal,
    })
  },

  async discoverListings({ request, page, runtime }) {
    const pageIndex = request.userData?.pageIndex || 1

    const listings = await page.evaluate(() => {
      const results = []
      const cards = document.querySelectorAll(
        '[data-testid="boat-card"] a, .boat-card a, .search-result-card a, a[href*="/boat/"], a[href*="/listing/"]',
      )
      const seen = new Set()

      for (const card of cards) {
        const href = card.href
        if (!href || seen.has(href)) continue
        if (!href.includes('/boat/') && !href.includes('/listing/')) continue

        seen.add(href)
        const text = card.textContent?.trim() || ''
        const priceEl = card.querySelector('[class*="price"], [data-testid="price"]')
        const price = priceEl?.textContent?.replace(/[^0-9]/g, '') || ''

        results.push({
          url: href,
          searchText: text,
          price,
        })
      }
      return results
    })

    const detailRequests = listings
      .filter((listing) => !listing.price || parseInt(listing.price, 10) <= runtime.maxPrice)
      .map((listing) => ({
        url: listing.url,
        userData: { searchListing: listing },
      }))

    const nextUrl =
      pageIndex < runtime.maxPages
        ? await page.evaluate(() => {
            const nextBtn = document.querySelector(
              'a[aria-label="Next"], a.next, [data-testid="next-page"]',
            )
            return nextBtn?.href || null
          })
        : null

    return {
      detailRequests,
      searchRequests: nextUrl
        ? [
            {
              url: nextUrl,
              userData: { pageIndex: pageIndex + 1 },
            },
          ]
        : [],
    }
  },

  async extractDetail({ request, page }) {
    await page
      .waitForSelector('h1, [data-testid="boat-title"]', { timeout: 15_000 })
      .catch(() => {})

    return page.evaluate((sourceUrl) => {
      const getText = (selector) => document.querySelector(selector)?.textContent?.trim() || null
      const getAll = (selector) =>
        [...document.querySelectorAll(selector)]
          .map((element) => element.textContent?.trim())
          .filter(Boolean)

      const title = getText('h1') || getText('[data-testid="boat-title"]') || ''
      const titleMatch = title.match(/^(\d{4})?\s*(.+)/)
      const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null
      const makeModel = titleMatch?.[2]?.trim() || ''
      const [make, ...modelParts] = makeModel.split(/\s+/)
      const model = modelParts.join(' ')

      const priceText = getText('[data-testid="price"], [class*="price"], .Price') || ''
      const price = priceText.replace(/[^0-9]/g, '') || null

      const lengthText =
        getAll('[data-testid="length"], [class*="length"], .boat-length')
          .join(' ')
          .match(/(\d+)/)?.[1] || null

      const location =
        getText('[data-testid="location"], [class*="location"], .boat-location') || ''
      const locParts = location.split(',').map((part) => part.trim())
      const city = locParts[0] || null
      const state = locParts[1] || null

      const description =
        getText(
          '[data-testid="description"], .boat-description, .listing-description, [class*="description"]',
        ) || ''
      const images = [
        ...document.querySelectorAll(
          'img[src*="images"], img[data-src*="images"], [class*="gallery"] img, [class*="carousel"] img',
        ),
      ]
        .map((img) => img.src || img.dataset?.src || '')
        .filter((src) => src.startsWith('http') && !src.includes('placeholder'))
        .slice(0, 20)

      const sellerText = getText('[data-testid="seller"], [class*="seller"], .dealer-name') || ''
      const sellerType = /dealer|broker/i.test(sellerText)
        ? 'Dealer'
        : /private|owner/i.test(sellerText)
          ? 'Private Seller'
          : null

      const idMatch = sourceUrl.match(/(\d+)\/?$/)
      const listingId = idMatch ? idMatch[1] : null

      return {
        listingId,
        url: sourceUrl,
        source: 'boattrader.com',
        make: make || null,
        model: model || null,
        year,
        length: lengthText,
        price,
        currency: 'USD',
        location,
        city,
        state,
        country: 'US',
        description: description.slice(0, 5000),
        sellerType,
        listingType: 'Used',
        images,
        fullText: `${title} ${description}`.slice(0, 4000),
        scrapedAt: new Date().toISOString(),
      }
    }, request.url)
  },

  acceptBoatData(boatData, runtime) {
    if (!boatData.url || !boatData.make) {
      return {
        accepted: false,
        pageState: PAGE_STATES.PARSER_CHANGED,
        reason: 'Missing BoatTrader make or URL on detail page',
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

export function classifyBoatTraderSignal(signal) {
  const generic = classifyGenericSignal(signal)
  if (generic.state !== PAGE_STATES.OK) {
    return generic
  }

  const signalText = `${signal.title}\n${signal.bodyText}`
  if (/403|blocked|access denied|something went wrong/i.test(signalText)) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: 'BoatTrader returned a block or error page',
    })
  }

  if (/no boats available|no results/i.test(signal.bodyText)) {
    return makePageState(PAGE_STATES.NO_RESULTS, {
      summary: 'BoatTrader reported no results',
    })
  }

  return makePageState(PAGE_STATES.OK)
}
