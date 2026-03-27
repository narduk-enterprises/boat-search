import {
  classifyGenericSignal,
  makePageState,
  PAGE_STATES,
  readPageSignal,
} from '../page-state.mjs'

export const hullTruthSource = {
  key: 'hulltruth',
  displayName: 'The Hull Truth',
  dbSourceName: 'thehulltruth.com',
  parserVersion: '2026-03-27-hulltruth-v1',
  fallbackStrategy: 'stop source and fall back to operator review or manual import',
  policyStatus: 'allow',
  allowedHosts: ['www.thehulltruth.com', 'thehulltruth.com'],
  rateBudget: {
    defaultMinDelayMs: 2_500,
    jitterMs: 800,
  },

  getRuntime(env) {
    const maxPrice = parseInt(env.MAX_PRICE || '1000000', 10)
    const searchKeywords = [
      'hatteras convertible',
      'viking convertible',
      'bertram convertible',
      'cabo sportfish',
      'viking sportfish',
      'hatteras sportfish',
      'freeman fishing',
      'yellowfin fishing',
    ]

    return {
      headless: env.HEADLESS !== 'false',
      maxPages: parseInt(env.MAX_PAGES || '50', 10),
      maxConcurrency: parseInt(env.MAX_CONCURRENCY || '2', 10),
      maxRequestsPerCrawl: Math.max(parseInt(env.MAX_PAGES || '50', 10) * 10, 300),
      requestHandlerTimeoutSecs: 90,
      launchArgs: ['--disable-blink-features=AutomationControlled'],
      maxPrice,
      searchContext: {
        lengthMin: 40,
        lengthMax: 60,
        searchType: 'classifieds',
        searchLocation: 'US',
      },
      searchUrls: searchKeywords.map(
        (keyword) =>
          `https://www.thehulltruth.com/search.php?searchid=&query=${encodeURIComponent(keyword)}&titleonly=1&forumchoice%5B%5D=13&searchdate=365&order=date&showposts=0`,
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
    return url.includes('/showthread.php') || url.includes('/boats-classifieds/')
  },

  async detectBlockState({ page }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(2_000)
    const signal = await readPageSignal(page)
    const state = classifyHullTruthSignal(signal)
    return makePageState(state.state, {
      reason: state.reason,
      summary: state.summary,
      signal,
    })
  },

  async discoverListings({ request, page, runtime }) {
    const pageIndex = request.userData?.pageIndex || 1

    const threads = await page.evaluate(() => {
      const results = []
      const seen = new Set()
      const links = document.querySelectorAll('a[href*="showthread"], a[href*="boats-classifieds"]')

      for (const link of links) {
        const href = link.href
        if (!href || seen.has(href) || href.includes('#post')) continue

        const title = link.textContent?.trim() || ''
        if (!/sale|sell|for\s+sale|price|reduced|\$/i.test(title) && !/\d{4}\s+\w+/i.test(title)) {
          continue
        }

        seen.add(href)
        results.push({ url: href, title })
      }

      return results
    })

    const nextUrl =
      pageIndex < runtime.maxPages
        ? await page.evaluate(() => {
            const nextLink = document.querySelector(
              'a[rel="next"], a.pagenav-next, td.alt1 a:last-child',
            )
            return nextLink?.href || null
          })
        : null

    return {
      detailRequests: threads.map((thread) => ({
        url: thread.url,
        userData: { threadTitle: thread.title },
      })),
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
      .waitForSelector('#posts, .postbitlegacy, .postcontainer', { timeout: 15_000 })
      .catch(() => {})

    return page.evaluate((sourceUrl) => {
      const firstPost = document.querySelector(
        '.postbitlegacy .postcontent, .postcontainer .postcontent, #post_message_1, [id^="post_message_"]',
      )
      const postText = firstPost?.textContent?.trim() || ''
      const title = document.querySelector('h1, .threadtitle')?.textContent?.trim() || ''

      const titleMatch = title.match(/(\d{4})?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(\d+)?\s*(.*)/i)
      const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null
      const make = titleMatch?.[2]?.trim() || null
      const lengthFromTitle = titleMatch?.[3] || null
      const model = titleMatch?.[4]?.replace(/[-–—].*$/, '').trim() || null

      const priceMatch = `${title} ${postText}`.match(/\$\s*([\d,]+)/)
      const price = priceMatch ? priceMatch[1].replace(/,/g, '') : null

      let length = lengthFromTitle
      if (!length) {
        const lenMatch = postText.match(/(\d+)\s*(?:ft|foot|feet|')/i)
        length = lenMatch ? lenMatch[1] : null
      }

      const locationEl = document.querySelector('.userfield-location, [class*="location"]')
      const location = locationEl?.textContent?.trim() || null
      const images = [...(firstPost?.querySelectorAll('img') || [])]
        .map((img) => img.src || '')
        .filter(
          (src) =>
            src.startsWith('http') &&
            !src.includes('avatar') &&
            !src.includes('icon') &&
            !src.includes('smil'),
        )
        .slice(0, 20)

      const idMatch = sourceUrl.match(/(\d+)/)
      const listingId = idMatch ? idMatch[1] : null

      return {
        listingId,
        url: sourceUrl,
        source: 'thehulltruth.com',
        make,
        model,
        year,
        length,
        price,
        currency: 'USD',
        location,
        city: null,
        state: null,
        country: 'US',
        description: postText.slice(0, 5000),
        sellerType: 'Private Seller',
        listingType: 'Used',
        images,
        fullText: `${title} ${postText}`.slice(0, 4000),
        scrapedAt: new Date().toISOString(),
      }
    }, request.url)
  },

  acceptBoatData(boatData, runtime) {
    if (!boatData.make) {
      return {
        accepted: false,
        pageState: PAGE_STATES.PARSER_CHANGED,
        reason: 'Missing make on Hull Truth thread',
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

export function classifyHullTruthSignal(signal) {
  const generic = classifyGenericSignal(signal)
  if (generic.state !== PAGE_STATES.OK) {
    return generic
  }

  const signalText = `${signal.title}\n${signal.bodyText}`
  if (/403|blocked|access denied/i.test(signalText)) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: 'The Hull Truth returned a block page',
    })
  }

  if (/no matches found|no results/i.test(signal.bodyText)) {
    return makePageState(PAGE_STATES.NO_RESULTS, {
      summary: 'The Hull Truth reported no results',
    })
  }

  return makePageState(PAGE_STATES.OK)
}
