#!/usr/bin/env node
/**
 * Crawl 40-60ft sport-fishing power boats for sale in Texas.
 * Uses the live boats.com search results and validates detail pages before upserting.
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBoat, extractLength, cleanPrice } from './validate-boat.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');

const LENGTH_MIN = parseInt(process.env.LENGTH_MIN || '20', 10);
const LENGTH_MAX = parseInt(process.env.LENGTH_MAX || '60', 10);
const REQUIRED_STATE = process.env.REQUIRED_STATE || '*';
const SEARCH_CLASS = process.env.SEARCH_CLASS || 'power-sportfish';
const SEARCH_TYPE = process.env.SEARCH_TYPE || 'sport_fishing';
const SEARCH_COUNTRY = 'United States';
const SEARCH_DISTANCE = parseInt(process.env.SEARCH_DISTANCE || '1000', 10);
const SEARCH_ZIPS = (process.env.SEARCH_ZIPS || '77002,33101,10001,90001,98101,02101,60601,30301')
  .split(',')
  .map((zip) => zip.trim())
  .filter(Boolean);
const SEARCH_URLS = SEARCH_ZIPS.map((zip) =>
  buildSearchUrl({
    country: SEARCH_COUNTRY,
    postalCode: zip,
    distance: SEARCH_DISTANCE,
  }),
);

const HEADLESS = process.env.HEADLESS !== 'false';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '160', 10);
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '2', 10);

console.log('🚤 Starting Texas boat crawl...');
console.log(`   Search: ${LENGTH_MIN}-${LENGTH_MAX}ft ${SEARCH_TYPE} in ${REQUIRED_STATE}`);
console.log(`   Search zips: ${SEARCH_ZIPS.join(', ')}`);
console.log(`   Search distance: ${SEARCH_DISTANCE} miles`);
console.log(`   Max pages: ${MAX_PAGES}`);
console.log(`   Max concurrency: ${MAX_CONCURRENCY}`);
console.log(`   Headless: ${HEADLESS}\n`);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const job = db.prepare(`
  INSERT INTO crawl_jobs (search_url, status, started_at)
  VALUES (?, 'running', datetime('now'))
`).run(SEARCH_URLS.join('\n'));
const jobId = job.lastInsertRowid;

const upsertBoat = db.prepare(`
  INSERT INTO boats (
    listing_id, source, url, make, model, year, length, price, currency,
    location, city, state, country, description, seller_type, listing_type,
    images, full_text, scraped_at, updated_at,
    search_length_min, search_length_max, search_type, search_location
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    listing_id = excluded.listing_id,
    source = excluded.source,
    make = excluded.make,
    model = excluded.model,
    year = excluded.year,
    length = excluded.length,
    price = excluded.price,
    currency = excluded.currency,
    location = excluded.location,
    city = excluded.city,
    state = excluded.state,
    country = excluded.country,
    description = excluded.description,
    seller_type = excluded.seller_type,
    listing_type = excluded.listing_type,
    images = excluded.images,
    full_text = excluded.full_text,
    scraped_at = excluded.scraped_at,
    updated_at = excluded.updated_at,
    search_length_min = excluded.search_length_min,
    search_length_max = excluded.search_length_max,
    search_type = excluded.search_type,
    search_location = excluded.search_location
`);

const findBoatByUrl = db.prepare('SELECT id FROM boats WHERE url = ?');

let pagesProcessed = 0;
let listingsQueued = 0;
let boatsInserted = 0;
let boatsUpdated = 0;
const listingLinksFound = new Set();
const visitedSearchPages = new Set();

console.log(`📊 Created crawl job #${jobId}\n`);

const crawler = new PlaywrightCrawler({
  headless: HEADLESS,

  launchContext: {
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },

  maxRequestsPerCrawl: Math.max(MAX_PAGES * 3, 1000),
  maxConcurrency: MAX_CONCURRENCY,
  requestHandlerTimeoutSecs: 90,

  async requestHandler({ request, page, log }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);

    if (isDetailPage(request.url)) {
      await handleDetailPage({ request, page, log });
      return;
    }

    await handleSearchPage({ request, page, log });
  },

  failedRequestHandler({ request, log }) {
    log.error(`❌ Failed: ${request.url}`);
  },
});

async function handleSearchPage({ request, page, log }) {
  await page
    .waitForSelector('main a[href*="/power-boats/"]', { timeout: 12000 })
    .catch(() => {});

  const normalizedUrl = normalizeSearchPageUrl(request.url);
  if (visitedSearchPages.has(normalizedUrl)) {
    return;
  }

  visitedSearchPages.add(normalizedUrl);
  pagesProcessed += 1;
  log.info(`📄 Page ${pagesProcessed}: scanning search results`);

  const listings = await extractSearchListings(page);
  const matchedListings = REQUIRED_STATE === '*'
    ? listings
    : listings.filter((listing) => isTexasLocation(listing.location || listing.searchText));

  log.info(
    `   Found ${listings.length} listing cards, ${matchedListings.length} matched ${REQUIRED_STATE === '*' ? 'all US' : REQUIRED_STATE}`,
  );

  for (const listing of matchedListings) {
    if (listingLinksFound.has(listing.url)) {
      continue;
    }

    listingLinksFound.add(listing.url);
    listingsQueued += 1;

    await crawler.addRequests([
      {
        url: listing.url,
        userData: {
          listingId: listing.listingId,
          searchListing: listing,
        },
      },
    ]);
  }

  if (pagesProcessed >= MAX_PAGES) {
    log.info(`   Reached MAX_PAGES=${MAX_PAGES}, stopping pagination`);
    return;
  }

  const nextUrl = await extractNextPageUrl(page);
  if (!nextUrl) {
    log.info('   No next page found');
    return;
  }

  const normalizedNextUrl = normalizeSearchPageUrl(nextUrl);
  if (visitedSearchPages.has(normalizedNextUrl)) {
    log.info(`   Next page already visited: ${normalizedNextUrl}`);
    return;
  }

  log.info(`   Enqueueing next page: ${nextUrl}`);
  await crawler.addRequests([nextUrl]);
}

async function handleDetailPage({ request, page, log }) {
  try {
    const searchListing = request.userData?.searchListing || null;
    const boatData = await extractBoatDetails(page, searchListing);

    if (!boatData.url) {
      log.warning('   Skipping detail page with no URL');
      return;
    }

    const validation = validateBoat(boatData, {
      minLength: LENGTH_MIN,
      maxLength: LENGTH_MAX,
      requiredState: REQUIRED_STATE,
    });

    if (!validation.valid) {
      log.info(
        `❌ Rejected: ${boatData.make || ''} ${boatData.model || ''} - ${validation.errors.join(', ')}`,
      );
      return;
    }

    if (validation.warnings.length > 0) {
      log.info(
        `⚠️  Warnings for ${boatData.make || ''} ${boatData.model || ''}: ${validation.warnings.join(', ')}`,
      );
    }

    if (searchListing) {
      const mismatches = compareSearchListingToDetail(searchListing, boatData);
      if (mismatches.length > 0) {
        log.info(
          `   Search/detail mismatches for ${boatData.make || ''} ${boatData.model || ''}: ${mismatches.join('; ')}`,
        );
      }
    }

    const existing = findBoatByUrl.get(boatData.url);
    const imagesJson = boatData.images?.length ? JSON.stringify(boatData.images) : null;
    const timestamp = boatData.scrapedAt || new Date().toISOString();

    upsertBoat.run(
      boatData.listingId || null,
      boatData.source || 'boats.com',
      boatData.url,
      boatData.make || null,
      boatData.model || null,
      boatData.year ? parseInt(boatData.year, 10) : null,
      boatData.length || null,
      boatData.price || null,
      boatData.currency || 'USD',
      boatData.location || null,
      boatData.city || null,
      boatData.state || REQUIRED_STATE,
      boatData.country || 'US',
      boatData.description || null,
      boatData.sellerType || null,
      boatData.listingType || null,
      imagesJson,
      boatData.fullText || null,
      timestamp,
      timestamp,
      LENGTH_MIN,
      LENGTH_MAX,
      SEARCH_TYPE,
      REQUIRED_STATE,
    );

    if (existing) {
      boatsUpdated += 1;
    } else {
      boatsInserted += 1;
    }

    log.info(
      `✅ ${boatData.make || ''} ${boatData.model || ''} - ${boatData.location || REQUIRED_STATE} - ${boatData.length}ft`,
    );
  } catch (error) {
    log.error(`Failed to extract/save boat: ${error.message}`);
  }
}

async function extractSearchListings(page) {
  return page.evaluate((requiredState) => {
    const normalizeWhitespace = (value) =>
      value ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const isImageAssetUrl = (value) =>
      /^https?:\/\/images\.boats\.com\//i.test(value || '');

    const extractListingId = (url) => {
      const match = url.match(/-(\d+)\/?$/);
      return match ? match[1] : null;
    };

    const anchors = Array.from(document.querySelectorAll('main a[href*="/power-boats/"]'));
    const seen = new Set();
    const results = [];

    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute('href');
      if (!href || seen.has(href)) {
        continue;
      }

      const heading = normalizeWhitespace(anchor.querySelector('h1, h2, h3')?.textContent);
      const image = anchor.querySelector('img');
      const text = normalizeWhitespace(anchor.textContent);

      if (!heading || !image || !/\b(19|20)\d{2}\b/.test(text)) {
        continue;
      }

      const textChunks = Array.from(anchor.querySelectorAll('*'))
        .map((node) => normalizeWhitespace(node.textContent))
        .filter(Boolean);
      const location = textChunks.find((chunk) => /,\s*(?:Texas|TX)$/i.test(chunk));
      if (!location) {
        continue;
      }

      const priceMatch = text.match(/\$[\d,]+|Request Price/i);
      const yearMatch = text.match(/\b(19|20)\d{2}\b/g);

      const cardImage =
        image.currentSrc ||
        image.src ||
        image.getAttribute('data-src') ||
        image.getAttribute('data-lazy-src');

      const listing = {
        url: href.startsWith('http') ? href : `https://www.boats.com${href}`,
        listingId: extractListingId(href),
        title: heading,
        location,
        year: yearMatch ? yearMatch[yearMatch.length - 1] : null,
        price: priceMatch ? priceMatch[0] : null,
        image: isImageAssetUrl(cardImage) ? cardImage : null,
        searchText: text,
      };

      if (!listing.location.toLowerCase().includes(requiredState.toLowerCase())) {
        continue;
      }

      seen.add(listing.url);
      results.push(listing);
    }

    return results;
  }, REQUIRED_STATE);
}

async function extractNextPageUrl(page) {
  return page.evaluate(() => {
    const nextLink = Array.from(document.querySelectorAll('a[href]')).find((link) => {
      const text = (link.textContent || '').replace(/\s+/g, ' ').trim();
      return text === 'Next →' || text === 'Next' || text === '→';
    });

    if (!nextLink) {
      return null;
    }

    const href = nextLink.href || nextLink.getAttribute('href');
    return href && href.startsWith('http') ? href : href ? `https://www.boats.com${href}` : null;
  });
}

async function extractBoatDetails(page, searchListing) {
  const url = page.url();
  const listingId = searchListing?.listingId || extractListingIdFromUrl(url);
  const title = await page.title().catch(() => '');

  await page
    .waitForSelector('main img[src*="images.boats.com"], main img[data-src*="images.boats.com"]', {
      timeout: 8000,
    })
    .catch(() => {});

  const pageData = await page.evaluate(({ listingId: currentListingId, searchTitle }) => {
    const normalizeWhitespace = (value) =>
      value ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const isImageAssetUrl = (value) =>
      /^https?:\/\/images\.boats\.com\//i.test(value || '');

    const normalizeTitle = (value) =>
      normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const extractSectionText = (headingText) => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      const heading = headings.find(
        (node) => normalizeWhitespace(node.textContent).toLowerCase() === headingText.toLowerCase(),
      );

      if (!heading) {
        return '';
      }

      let container = heading.parentElement;
      while (container && container !== document.body) {
        const text = normalizeWhitespace(container.innerText);
        if (text.toLowerCase().includes(headingText.toLowerCase())) {
          const lines = Array.from(container.querySelectorAll('p, li'))
            .map((node) => normalizeWhitespace(node.textContent))
            .filter(Boolean);
          if (lines.length > 0) {
            return lines.join('\n');
          }
        }
        container = container.parentElement;
      }

      return '';
    };

    const detailMap = {};
    for (const row of Array.from(document.querySelectorAll('table tr'))) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      if (cells.length < 2) {
        continue;
      }

      const key = normalizeWhitespace(cells[0].textContent).toLowerCase();
      const value = normalizeWhitespace(cells[cells.length - 1].textContent);
      if (key && value && !(key in detailMap)) {
        detailMap[key] = value;
      }
    }

    const heading = normalizeWhitespace(document.querySelector('main h1')?.textContent);
    const sellerHeading = Array.from(document.querySelectorAll('h2, h3'))
      .find((node) => normalizeWhitespace(node.textContent).toLowerCase() === 'presented for sale by:');
    const sellerType = sellerHeading
      ? normalizeWhitespace(
          sellerHeading.parentElement?.querySelector('h3')?.textContent ||
            sellerHeading.parentElement?.querySelector('h4')?.textContent,
        )
      : '';

    const allImages = Array.from(document.querySelectorAll('main img'))
      .map((img, index) => {
        const src =
          img.currentSrc ||
          img.src ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src');
        if (!isImageAssetUrl(src)) {
          return null;
        }

        const alt = normalizeWhitespace(img.alt);
        const width = img.naturalWidth || img.width || 0;
        const classContext = [
          img.className,
          img.parentElement?.className,
          img.closest('[class]')?.className,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (
          /logo|icon|banner|ads_choice|adchoices/i.test(src) ||
          /logo|icon/i.test(alt) ||
          /blog\.boats\.com/i.test(src)
        ) {
          return null;
        }

        let score = 0;
        if (currentListingId && src.includes(currentListingId)) {
          score += 100;
        }
        if (/image\s+\d+$/i.test(alt)) {
          score += 40;
        }
        if (searchTitle && normalizeTitle(alt).includes(normalizeTitle(searchTitle))) {
          score += 20;
        }
        if (heading && normalizeTitle(alt).includes(normalizeTitle(heading))) {
          score += 20;
        }
        if (width >= 800) {
          score += 10;
        }
        if (/similar|related|service|article|item-target|img-container/.test(classContext)) {
          score -= 80;
        }

        return { src, alt, score, index };
      })
      .filter(Boolean);

    const listingIdImages = currentListingId
      ? allImages.filter((image) => image.src.includes(currentListingId))
      : [];

    const rankedImages = (listingIdImages.length > 0
      ? listingIdImages
      : allImages.filter((image) => image.score > 0)
    )
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((image) => image.src)
      .filter((src, index, values) => values.indexOf(src) === index)
      .slice(0, 15);

    return {
      heading,
      detailMap,
      sellerType,
      description: extractSectionText('Description'),
      fullText: normalizeWhitespace(document.body.innerText).slice(0, 15000),
      images: rankedImages,
    };
  }, { listingId, searchTitle: searchListing?.title || '' });

  const data = {
    url,
    title,
    listingId,
    source: 'boats.com',
    scrapedAt: new Date().toISOString(),
  };

  const detailMap = pageData.detailMap || {};

  data.make = detailMap.make || null;
  data.model = detailMap.model || null;
  data.year = detailMap.year || searchListing?.year || null;
  data.price = cleanPrice(detailMap.price || searchListing?.price || null);
  data.currency = /CA\$|CAD/i.test(detailMap.price || '')
    ? 'CAD'
    : /€/.test(detailMap.price || '')
      ? 'EUR'
      : 'USD';
  data.length = extractLength(detailMap.length || pageData.heading || '');
  data.location = detailMap.location || searchListing?.location || null;
  data.description = pageData.description || null;
  data.sellerType = pageData.sellerType || inferSellerType(searchListing?.searchText || '') || null;
  data.listingType = detailMap.class || null;
  data.fullText = pageData.fullText || null;

  if ((!data.make || !data.model) && pageData.heading) {
    const parsedHeading = parseTitleHeading(pageData.heading);
    data.make = data.make || parsedHeading.make;
    data.model = data.model || parsedHeading.model;
  }

  if ((!data.make || !data.model) && title) {
    const parsedTitle = parsePageTitle(title);
    data.make = data.make || parsedTitle.make;
    data.model = data.model || parsedTitle.model;
    data.year = data.year || parsedTitle.year;
  }

  const parsedLocation = parseLocation(data.location);
  data.city = parsedLocation.city;
  data.state = parsedLocation.state;
  data.country = parsedLocation.country || 'US';

  data.images = Array.isArray(pageData.images) ? pageData.images : [];
  if (data.images.length === 0 && isLikelyImageUrl(searchListing?.image)) {
    data.images = [searchListing.image];
  }

  return data;
}

function buildSearchUrl({ pageNumber = 1, country = null, postalCode = null, distance = null } = {}) {
  const url = new URL('https://www.boats.com/boats-for-sale/');
  url.searchParams.set('boat-type', 'power');
  url.searchParams.set('class', SEARCH_CLASS);
  url.searchParams.set('length', `${LENGTH_MIN}-${LENGTH_MAX}ft`);
  if (country) {
    url.searchParams.set('country', country);
  }
  if (postalCode) {
    url.searchParams.set('postal-code', postalCode);
  }
  if (distance) {
    url.searchParams.set('distance', String(distance));
  }
  if (pageNumber > 1) {
    url.searchParams.set('page', String(pageNumber));
  }
  return url.toString();
}

function isDetailPage(url) {
  return url.includes('/power-boats/');
}

function normalizeSearchPageUrl(url) {
  const parsed = new URL(url);
  parsed.hash = '';

  const params = Array.from(parsed.searchParams.entries()).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  parsed.search = '';
  for (const [key, value] of params) {
    parsed.searchParams.append(key, value);
  }

  return parsed.toString();
}

function extractListingIdFromUrl(url) {
  const match = url.match(/-(\d+)\/?$/);
  return match ? match[1] : null;
}

function normalizeWhitespace(value) {
  return value ? value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function parsePageTitle(title) {
  const match = normalizeWhitespace(title).match(/^(\d{4})\s+(.+?)\s+-\s+boats\.com$/i);
  if (!match) {
    return { year: null, make: null, model: null };
  }

  const year = match[1];
  const parsed = parseTitleHeading(match[2]);
  return { year, make: parsed.make, model: parsed.model };
}

function parseTitleHeading(heading) {
  const cleanedHeading = normalizeWhitespace(heading);
  if (!cleanedHeading) {
    return { make: null, model: null };
  }

  const parts = cleanedHeading.split(' ');
  if (parts.length === 1) {
    return { make: parts[0], model: null };
  }

  return {
    make: parts[0],
    model: parts.slice(1).join(' '),
  };
}

function parseLocation(locationText) {
  const location = normalizeWhitespace(locationText);
  if (!location) {
    return { city: null, state: null, country: null };
  }

  const parts = location.split(',').map((part) => normalizeWhitespace(part)).filter(Boolean);
  if (parts.length === 1) {
    return {
      city: null,
      state: normalizeState(parts[0]),
      country: normalizeState(parts[0]) === REQUIRED_STATE ? 'US' : null,
    };
  }

  if (parts.length === 2) {
    const state = normalizeState(parts[1]);
    return {
      city: parts[0],
      state,
      country: state === REQUIRED_STATE ? 'US' : null,
    };
  }

  const state = normalizeState(parts[1]);
  return {
    city: parts[0],
    state,
    country: parts.slice(2).join(', ') || (state === REQUIRED_STATE ? 'US' : null),
  };
}

function normalizeState(value) {
  const cleaned = normalizeWhitespace(value);
  if (/^tx$/i.test(cleaned)) {
    return REQUIRED_STATE;
  }
  return cleaned;
}

function isTexasLocation(value) {
  const cleaned = normalizeWhitespace(value).toLowerCase();
  return cleaned.includes('texas') || /\btx\b/.test(cleaned);
}

function inferSellerType(text) {
  const cleaned = normalizeWhitespace(text);
  if (/private seller/i.test(cleaned)) {
    return 'Private Seller';
  }
  if (/broker|dealer|seller/i.test(cleaned)) {
    return 'Dealer';
  }
  return null;
}

function isLikelyImageUrl(value) {
  return /^https?:\/\/images\.boats\.com\//i.test(value || '');
}

function compareSearchListingToDetail(searchListing, boatData) {
  const mismatches = [];

  if (searchListing.year && boatData.year && String(searchListing.year) !== String(boatData.year)) {
    mismatches.push(`year ${searchListing.year} vs ${boatData.year}`);
  }

  if (
    searchListing.location &&
    boatData.location &&
    normalizeWhitespace(searchListing.location).toLowerCase() !==
      normalizeWhitespace(boatData.location).toLowerCase()
  ) {
    mismatches.push(`location ${searchListing.location} vs ${boatData.location}`);
  }

  const searchTitle = normalizeWhitespace(searchListing.title).toLowerCase();
  const detailTitle = normalizeWhitespace(`${boatData.make || ''} ${boatData.model || ''}`).toLowerCase();
  if (searchTitle && detailTitle && !detailTitle.includes(searchTitle) && !searchTitle.includes(detailTitle)) {
    mismatches.push(`title ${searchListing.title} vs ${boatData.make || ''} ${boatData.model || ''}`.trim());
  }

  return mismatches;
}

async function main() {
  try {
    await crawler.addRequests(SEARCH_URLS);
    await crawler.run();

    const legacyCleanup = db.prepare(`
      DELETE FROM boats
      WHERE search_length_min = ?
        AND search_length_max = ?
        AND search_location = ?
        AND search_type = 'fishing'
    `).run(LENGTH_MIN, LENGTH_MAX, REQUIRED_STATE);

    db.prepare(`
      UPDATE crawl_jobs
      SET status = 'completed',
          boats_found = ?,
          boats_scraped = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `).run(listingLinksFound.size, boatsInserted + boatsUpdated, jobId);

    console.log(`\n✅ Crawl complete!`);
    console.log(`   Pages processed: ${pagesProcessed}`);
    console.log(`   Texas listings queued: ${listingsQueued}`);
    console.log(`   Boats inserted: ${boatsInserted}`);
    console.log(`   Boats updated: ${boatsUpdated}`);
    console.log(`   Legacy rows removed: ${legacyCleanup.changes}`);
    console.log(`   Database: ${dbPath}\n`);

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT make) as makes,
        MIN(CAST(price AS INTEGER)) as min_price,
        MAX(CAST(price AS INTEGER)) as max_price,
        AVG(CAST(price AS INTEGER)) as avg_price
      FROM boats
      WHERE state = ?
        AND search_length_min = ?
        AND search_length_max = ?
        AND search_type = ?
    `).get(REQUIRED_STATE, LENGTH_MIN, LENGTH_MAX, SEARCH_TYPE);

    console.log('📊 Database Summary:');
    console.log(`   Total boats: ${summary.total}`);
    console.log(`   Unique makes: ${summary.makes}`);
    if (summary.min_price) {
      console.log(`   Price range: $${summary.min_price.toLocaleString()} - $${summary.max_price.toLocaleString()}`);
      console.log(`   Average price: $${Math.round(summary.avg_price).toLocaleString()}`);
    }
  } catch (error) {
    db.prepare(`
      UPDATE crawl_jobs
      SET status = 'failed',
          error = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `).run(error.message, jobId);

    console.error(`\n❌ Crawl failed: ${error.message}`);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
