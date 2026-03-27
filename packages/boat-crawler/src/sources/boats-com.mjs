import {
  classifyGenericSignal,
  makePageState,
  PAGE_STATES,
  readPageSignal,
} from '../page-state.mjs'
import { normalizeWhitespace } from '../utils.mjs'
import { cleanPrice, extractLength, validateBoat } from '../../scripts/validate-boat.mjs'

export const boatsComSource = {
  key: 'boats-com',
  displayName: 'Boats.com',
  dbSourceName: 'boats.com',
  parserVersion: '2026-03-27-boats-com-v1',
  fallbackStrategy: 'stop source and use alternate authorized source or manual import',
  policyStatus: 'allow',
  allowedHosts: ['www.boats.com', 'boats.com'],
  rateBudget: {
    defaultMinDelayMs: 1_500,
    jitterMs: 600,
  },

  getRuntime(env) {
    const lengthMin = parseInt(env.LENGTH_MIN || '20', 10)
    const lengthMax = parseInt(env.LENGTH_MAX || '60', 10)
    const requiredState = env.REQUIRED_STATE || '*'
    const searchClass = env.SEARCH_CLASS || 'power-sportfish'
    const searchType = env.SEARCH_TYPE || 'sport_fishing'
    const searchCountry = 'United States'
    const searchDistance = parseInt(env.SEARCH_DISTANCE || '1000', 10)
    const searchZips = (env.SEARCH_ZIPS || '77002,33101,10001,90001,98101,02101,60601,30301')
      .split(',')
      .map((zip) => zip.trim())
      .filter(Boolean)
    const searchUrls = searchZips.map((zip) =>
      buildSearchUrl({
        lengthMin,
        lengthMax,
        searchClass,
        country: searchCountry,
        postalCode: zip,
        distance: searchDistance,
      }),
    )

    return {
      headless: env.HEADLESS !== 'false',
      maxPages: parseInt(env.MAX_PAGES || '160', 10),
      maxConcurrency: parseInt(env.MAX_CONCURRENCY || '2', 10),
      maxRequestsPerCrawl: Math.max(parseInt(env.MAX_PAGES || '160', 10) * 3, 1000),
      requestHandlerTimeoutSecs: 90,
      launchArgs: ['--disable-blink-features=AutomationControlled'],
      requiredState,
      searchType,
      searchClass,
      searchUrls,
      searchContext: {
        lengthMin,
        lengthMax,
        searchType,
        searchLocation: requiredState,
      },
    }
  },

  buildSearchRequests(runtime) {
    return runtime.searchUrls.map((url) => ({
      url,
      userData: { pageIndex: 1 },
    }))
  },

  isDetailUrl(url) {
    return url.includes('/power-boats/')
  },

  async detectBlockState({ page, isDetail }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => {})
    await page.waitForTimeout(1_200)

    const signal = await readPageSignal(page)
    const generic = classifyBoatsComSignal(signal, { isDetail })
    return makePageState(generic.state, {
      reason: generic.reason,
      summary: generic.summary,
      signal,
    })
  },

  async discoverListings({ request, page, runtime }) {
    const listings = await extractSearchListings(page, runtime.requiredState)
    const pageIndex = request.userData?.pageIndex || 1
    const nextUrl = pageIndex < runtime.maxPages ? await extractNextPageUrl(page) : null

    return {
      detailRequests: listings.map((listing) => ({
        url: listing.url,
        userData: {
          listingId: listing.listingId,
          searchListing: listing,
        },
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
    return extractBoatDetails(page, request.userData?.searchListing || null)
  },

  acceptBoatData(boatData, runtime) {
    const validation = validateBoat(boatData, {
      minLength: runtime.searchContext.lengthMin,
      maxLength: runtime.searchContext.lengthMax,
      requiredState: runtime.requiredState,
    })

    if (!validation.valid) {
      return {
        accepted: false,
        reason: validation.errors.join(', '),
      }
    }

    return { accepted: true }
  },
}

export function classifyBoatsComSignal(signal, { isDetail }) {
  const generic = classifyGenericSignal(signal)
  if (generic.state !== PAGE_STATES.OK) {
    return generic
  }

  const signalText = `${signal.title}\n${signal.bodyText}`
  if (/something went wrong|service unavailable|temporarily unavailable/i.test(signalText)) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: 'Boats.com returned an error/interstitial page',
    })
  }

  if (!isDetail && /no boats match|0 results|no listings found/i.test(signal.bodyText)) {
    return makePageState(PAGE_STATES.NO_RESULTS, {
      summary: 'Boats.com reported no results',
    })
  }

  return makePageState(PAGE_STATES.OK)
}

async function extractSearchListings(page, requiredState) {
  return page.evaluate((requiredStateValue) => {
    const normalize = (value) =>
      value
        ? value
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : ''
    const extractListingId = (url) => {
      const match = url.match(/-(\d+)\/?$/)
      return match ? match[1] : null
    }

    const anchors = Array.from(document.querySelectorAll('main a[href*="/power-boats/"]'))
    const seen = new Set()
    const results = []

    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute('href')
      if (!href || seen.has(href)) {
        continue
      }

      const heading = normalize(anchor.querySelector('h1, h2, h3')?.textContent)
      const image = anchor.querySelector('img')
      const text = normalize(anchor.textContent)

      if (!heading || !image || !/\b(19|20)\d{2}\b/.test(text)) {
        continue
      }

      const textChunks = Array.from(anchor.querySelectorAll('*'))
        .map((node) => normalize(node.textContent))
        .filter(Boolean)
      const location = textChunks.find((chunk) => /,\s*(?:[A-Z]{2}|[A-Za-z ]+)$/i.test(chunk)) || ''

      if (
        requiredStateValue !== '*' &&
        !location.toLowerCase().includes(requiredStateValue.toLowerCase()) &&
        !(requiredStateValue === 'Texas' && /\btx\b/i.test(location))
      ) {
        continue
      }

      const priceMatch = text.match(/\$[\d,]+|Request Price/i)
      const yearMatch = text.match(/\b(19|20)\d{2}\b/g)

      results.push({
        url: href.startsWith('http') ? href : `https://www.boats.com${href}`,
        listingId: extractListingId(href),
        title: heading,
        location,
        year: yearMatch ? yearMatch[yearMatch.length - 1] : null,
        price: priceMatch ? priceMatch[0] : null,
        image:
          image.currentSrc ||
          image.src ||
          image.getAttribute('data-src') ||
          image.getAttribute('data-lazy-src'),
        searchText: text,
      })

      seen.add(href)
    }

    return results
  }, requiredState)
}

async function extractNextPageUrl(page) {
  return page.evaluate(() => {
    const nextLink = Array.from(document.querySelectorAll('a[href]')).find((link) => {
      const text = (link.textContent || '').replace(/\s+/g, ' ').trim()
      return text === 'Next →' || text === 'Next' || text === '→'
    })

    if (!nextLink) {
      return null
    }

    const href = nextLink.href || nextLink.getAttribute('href')
    return href && href.startsWith('http') ? href : href ? `https://www.boats.com${href}` : null
  })
}

async function extractBoatDetails(page, searchListing) {
  const url = page.url()
  const listingId = searchListing?.listingId || extractListingIdFromUrl(url)
  const title = await page.title().catch(() => '')

  await page
    .waitForSelector('main img[src*="images.boats.com"], main img[data-src*="images.boats.com"]', {
      timeout: 8_000,
    })
    .catch(() => {})

  const pageData = await page.evaluate(
    ({ listingId: currentListingId, searchTitle }) => {
      const normalize = (value) =>
        value
          ? value
              .replace(/\u00a0/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : ''
      const isImageAssetUrl = (value) => /^https?:\/\/images\.boats\.com\//i.test(value || '')
      const normalizeTitle = (value) =>
        normalize(value)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()

      const detailMap = {}
      for (const row of Array.from(document.querySelectorAll('table tr'))) {
        const cells = Array.from(row.querySelectorAll('th, td'))
        if (cells.length < 2) {
          continue
        }

        const key = normalize(cells[0].textContent).toLowerCase()
        const value = normalize(cells[cells.length - 1].textContent)
        if (key && value && !(key in detailMap)) {
          detailMap[key] = value
        }
      }

      const heading = normalize(document.querySelector('main h1')?.textContent)
      const sellerHeading = Array.from(document.querySelectorAll('h2, h3')).find(
        (node) => normalize(node.textContent).toLowerCase() === 'presented for sale by:',
      )
      const sellerType = sellerHeading
        ? normalize(
            sellerHeading.parentElement?.querySelector('h3')?.textContent ||
              sellerHeading.parentElement?.querySelector('h4')?.textContent,
          )
        : ''

      const images = Array.from(document.querySelectorAll('main img'))
        .map((img, index) => {
          const src =
            img.currentSrc ||
            img.src ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src')
          if (!isImageAssetUrl(src)) {
            return null
          }

          const alt = normalize(img.alt)
          let score = 0
          if (currentListingId && src.includes(currentListingId)) score += 100
          if (/image\s+\d+$/i.test(alt)) score += 30
          if (searchTitle && normalizeTitle(alt).includes(normalizeTitle(searchTitle))) score += 20
          return { src, score, index }
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map((image) => image.src)
        .filter((src, index, values) => values.indexOf(src) === index)
        .slice(0, 15)

      return {
        heading,
        detailMap,
        sellerType,
        fullText: normalize(document.body.innerText).slice(0, 15_000),
        images,
      }
    },
    { listingId, searchTitle: searchListing?.title || '' },
  )

  const detailMap = pageData.detailMap || {}
  const data = {
    url,
    title,
    listingId,
    source: 'boats.com',
    scrapedAt: new Date().toISOString(),
    make: detailMap.make || null,
    model: detailMap.model || null,
    year: detailMap.year || searchListing?.year || null,
    price: cleanPrice(detailMap.price || searchListing?.price || null),
    currency: /CA\$|CAD/i.test(detailMap.price || '')
      ? 'CAD'
      : /€/.test(detailMap.price || '')
        ? 'EUR'
        : 'USD',
    length: extractLength(detailMap.length || pageData.heading || ''),
    location: detailMap.location || searchListing?.location || null,
    description: detailMap.description || null,
    sellerType: pageData.sellerType || inferSellerType(searchListing?.searchText || '') || null,
    listingType: detailMap.class || null,
    fullText: pageData.fullText || null,
    images: pageData.images || [],
  }

  if ((!data.make || !data.model) && pageData.heading) {
    const parsedHeading = parseTitleHeading(pageData.heading)
    data.make = data.make || parsedHeading.make
    data.model = data.model || parsedHeading.model
  }

  if ((!data.make || !data.model) && title) {
    const parsedTitle = parsePageTitle(title)
    data.make = data.make || parsedTitle.make
    data.model = data.model || parsedTitle.model
    data.year = data.year || parsedTitle.year
  }

  const parsedLocation = parseLocation(data.location)
  data.city = parsedLocation.city
  data.state = parsedLocation.state
  data.country = parsedLocation.country || 'US'

  return data
}

function buildSearchUrl({
  lengthMin,
  lengthMax,
  searchClass,
  country,
  postalCode,
  distance,
  pageNumber = 1,
}) {
  const url = new URL('https://www.boats.com/boats-for-sale/')
  url.searchParams.set('boat-type', 'power')
  url.searchParams.set('class', searchClass)
  url.searchParams.set('length', `${lengthMin}-${lengthMax}ft`)
  if (country) url.searchParams.set('country', country)
  if (postalCode) url.searchParams.set('postal-code', postalCode)
  if (distance) url.searchParams.set('distance', String(distance))
  if (pageNumber > 1) url.searchParams.set('page', String(pageNumber))
  return url.toString()
}

function extractListingIdFromUrl(url) {
  const match = url.match(/-(\d+)\/?$/)
  return match ? match[1] : null
}

function parsePageTitle(title) {
  const match = normalizeWhitespace(title).match(/^(\d{4})\s+(.+?)\s+-\s+boats\.com$/i)
  if (!match) {
    return { year: null, make: null, model: null }
  }

  const year = match[1]
  const parsed = parseTitleHeading(match[2])
  return { year, make: parsed.make, model: parsed.model }
}

function parseTitleHeading(heading) {
  const cleanedHeading = normalizeWhitespace(heading)
  if (!cleanedHeading) {
    return { make: null, model: null }
  }

  const parts = cleanedHeading.split(' ')
  if (parts.length === 1) {
    return { make: parts[0], model: null }
  }

  return {
    make: parts[0],
    model: parts.slice(1).join(' '),
  }
}

function parseLocation(locationText) {
  const location = normalizeWhitespace(locationText)
  if (!location) {
    return { city: null, state: null, country: null }
  }

  const parts = location
    .split(',')
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean)
  if (parts.length === 1) {
    return { city: null, state: normalizeState(parts[0]), country: null }
  }

  if (parts.length === 2) {
    return {
      city: parts[0],
      state: normalizeState(parts[1]),
      country: 'US',
    }
  }

  return {
    city: parts[0],
    state: normalizeState(parts[1]),
    country: parts.slice(2).join(', ') || 'US',
  }
}

function normalizeState(value) {
  const cleaned = normalizeWhitespace(value)
  if (/^tx$/i.test(cleaned)) {
    return 'Texas'
  }
  return cleaned
}

function inferSellerType(text) {
  const cleaned = normalizeWhitespace(text)
  if (/private seller/i.test(cleaned)) {
    return 'Private Seller'
  }
  if (/broker|dealer|seller/i.test(cleaned)) {
    return 'Dealer'
  }
  return null
}
