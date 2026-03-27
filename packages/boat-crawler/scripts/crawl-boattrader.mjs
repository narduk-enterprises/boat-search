#!/usr/bin/env node
/**
 * Crawl 40-60ft convertible/sportfish power boats from BoatTrader.
 * Uses Playwright + Crawlee, same pattern as crawl-texas-boats.mjs.
 *
 * BoatTrader URL structure:
 *   /boats/type-power/class-sportfish-convertible/?length=40-60&price=,1000000&page=1
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');

const LENGTH_MIN = parseInt(process.env.LENGTH_MIN || '20', 10);
const LENGTH_MAX = parseInt(process.env.LENGTH_MAX || '60', 10);
const MIN_PRICE = parseInt(process.env.MIN_PRICE || '0', 10);
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '2000000', 10);
const HEADLESS = process.env.HEADLESS !== 'false';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '100', 10);
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '2', 10);

// BoatTrader search URLs — sportfish + convertible classes
const CLASSES = ['sportfish-convertible', 'sportfish', 'convertible', 'center-console', 'express', 'walkaround', 'cuddy-cabin'];
const SEARCH_URLS = CLASSES.map((cls) =>
  `https://www.boattrader.com/boats/type-power/class-${cls}/?length=${LENGTH_MIN}-${LENGTH_MAX}&price=,${MAX_PRICE}&page=1`,
);

console.log('🚤 Starting BoatTrader crawl...');
console.log(`   Search: ${LENGTH_MIN}-${LENGTH_MAX}ft sportfish/convertible, under $${MAX_PRICE.toLocaleString()}`);
console.log(`   Classes: ${CLASSES.join(', ')}`);
console.log(`   Max pages: ${MAX_PAGES}`);
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
    make = excluded.make,
    model = excluded.model,
    year = excluded.year,
    length = excluded.length,
    price = excluded.price,
    location = excluded.location,
    city = excluded.city,
    state = excluded.state,
    description = excluded.description,
    seller_type = excluded.seller_type,
    listing_type = excluded.listing_type,
    images = excluded.images,
    full_text = excluded.full_text,
    updated_at = excluded.updated_at
`);

let pagesProcessed = 0;
let boatsInserted = 0;
let boatsUpdated = 0;
const visitedUrls = new Set();

console.log(`📊 Created crawl job #${jobId}\n`);

const crawler = new PlaywrightCrawler({
  headless: HEADLESS,
  launchContext: {
    launchOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
    },
  },
  maxRequestsPerCrawl: Math.max(MAX_PAGES * 5, 500),
  maxConcurrency: MAX_CONCURRENCY,
  requestHandlerTimeoutSecs: 90,

  async requestHandler({ request, page, log }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500 + Math.random() * 1000);

    const status = await page.evaluate(() => document.querySelector('title')?.textContent || '');
    if (status.includes('403') || status.includes('blocked')) {
      throw new Error('Request blocked - received 403 status code');
    }

    if (request.url.includes('/listing/') || request.url.includes('/boat/')) {
      await handleDetailPage({ request, page, log });
    } else {
      await handleSearchPage({ request, page, log });
    }
  },

  failedRequestHandler({ request, log }) {
    log.error(`❌ Failed: ${request.url}`);
  },
});

async function handleSearchPage({ request, page, log }) {
  pagesProcessed += 1;
  log.info(`📄 Page ${pagesProcessed}: scanning BoatTrader results`);

  // Wait for listing cards
  await page.waitForSelector('[data-testid="boat-card"], .boat-card, .search-result-card, a[href*="/boat/"], a[href*="/listing/"]', { timeout: 15000 }).catch(() => {});

  // Extract boat listing links
  const listings = await page.evaluate(() => {
    const results = [];
    const cards = document.querySelectorAll(
      '[data-testid="boat-card"] a, .boat-card a, .search-result-card a, ' +
      'a[href*="/boat/"], a[href*="/listing/"]'
    );
    const seen = new Set();

    for (const card of cards) {
      const href = card.href;
      if (!href || seen.has(href)) continue;
      if (!href.includes('/boat/') && !href.includes('/listing/')) continue;

      seen.add(href);

      // Try to extract info from card text
      const text = card.textContent?.trim() || '';
      const priceEl = card.querySelector('[class*="price"], [data-testid="price"]');
      const price = priceEl?.textContent?.replace(/[^0-9]/g, '') || '';

      results.push({
        url: href,
        searchText: text,
        price,
      });
    }
    return results;
  });

  log.info(`   Found ${listings.length} listing links`);

  for (const listing of listings) {
    if (visitedUrls.has(listing.url)) continue;
    visitedUrls.add(listing.url);

    // Filter by price if available
    if (listing.price && parseInt(listing.price, 10) > MAX_PRICE) continue;

    await crawler.addRequests([{
      url: listing.url,
      userData: { searchListing: listing },
    }]);
  }

  // Find next page
  if (pagesProcessed < MAX_PAGES) {
    const nextUrl = await page.evaluate(() => {
      const nextBtn = document.querySelector('a[aria-label="Next"], a.next, [data-testid="next-page"]');
      return nextBtn?.href || null;
    });

    if (nextUrl && !visitedUrls.has(nextUrl)) {
      log.info(`   Enqueueing next page`);
      visitedUrls.add(nextUrl);
      await crawler.addRequests([nextUrl]);
    }
  }
}

async function handleDetailPage({ request, page, log }) {
  try {
    // Wait for content to load
    await page.waitForSelector('h1, [data-testid="boat-title"]', { timeout: 15000 }).catch(() => {});

    const boatData = await page.evaluate((sourceUrl) => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
      const getAll = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent?.trim()).filter(Boolean);

      // Title parsing: "2005 Hatteras 50 Convertible"
      const title = getText('h1') || getText('[data-testid="boat-title"]') || '';
      const titleMatch = title.match(/^(\d{4})?\s*(.+)/);
      const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null;
      const makeModel = titleMatch?.[2]?.trim() || '';
      const [make, ...modelParts] = makeModel.split(/\s+/);
      const model = modelParts.join(' ');

      // Price
      const priceText = getText('[data-testid="price"], [class*="price"], .Price') || '';
      const price = priceText.replace(/[^0-9]/g, '') || null;

      // Length
      const lengthText = getAll('[data-testid="length"], [class*="length"], .boat-length')
        .join(' ')
        .match(/(\d+)/)?.[1] || null;

      // Location
      const location = getText('[data-testid="location"], [class*="location"], .boat-location') || '';
      const locParts = location.split(',').map((s) => s.trim());
      const city = locParts[0] || null;
      const state = locParts[1] || null;

      // Description
      const description = getText('[data-testid="description"], .boat-description, .listing-description, [class*="description"]') || '';

      // Images
      const images = [...document.querySelectorAll('img[src*="images"], img[data-src*="images"], [class*="gallery"] img, [class*="carousel"] img')]
        .map((img) => img.src || img.dataset?.src || '')
        .filter((src) => src.startsWith('http') && !src.includes('placeholder'))
        .slice(0, 20);

      // Seller type
      const sellerText = getText('[data-testid="seller"], [class*="seller"], .dealer-name') || '';
      const sellerType = /dealer|broker/i.test(sellerText) ? 'Dealer' : /private|owner/i.test(sellerText) ? 'Private Seller' : null;

      // Listing ID from URL
      const idMatch = sourceUrl.match(/(\d+)\/?$/);
      const listingId = idMatch ? idMatch[1] : null;

      return {
        listingId,
        url: sourceUrl,
        make: make || null,
        model: model || null,
        year,
        length: lengthText,
        price,
        location,
        city,
        state,
        country: 'US',
        description: description.slice(0, 5000),
        sellerType,
        listingType: 'Used',
        images: JSON.stringify(images),
        fullText: title + ' ' + description.slice(0, 2000),
      };
    }, request.url);

    if (!boatData.url || !boatData.make) {
      log.warning(`   Skipping: insufficient data for ${request.url}`);
      return;
    }

    // Length validation
    const length = parseFloat(boatData.length || '0');
    if (length > 0 && (length < LENGTH_MIN || length > LENGTH_MAX)) {
      log.info(`   Skipping: ${length}ft outside range`);
      return;
    }

    // Price validation
    const price = parseInt(boatData.price || '0', 10);
    if (price > MAX_PRICE) {
      log.info(`   Skipping: $${price.toLocaleString()} over budget`);
      return;
    }

    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM boats WHERE url = ?').get(boatData.url);

    upsertBoat.run(
      boatData.listingId, 'boattrader.com', boatData.url, boatData.make, boatData.model,
      boatData.year, boatData.length, boatData.price, 'USD',
      boatData.location, boatData.city, boatData.state, boatData.country,
      boatData.description, boatData.sellerType, boatData.listingType,
      boatData.images, boatData.fullText, now, now,
      LENGTH_MIN, LENGTH_MAX, 'convertible', 'US',
    );

    if (existing) {
      boatsUpdated += 1;
    } else {
      boatsInserted += 1;
    }

    log.info(`✅ ${boatData.year || '?'} ${boatData.make} ${boatData.model} - ${boatData.city || '?'}, ${boatData.state || '?'} - ${boatData.length || '?'}ft`);
  } catch (error) {
    log.error(`   Error scraping detail: ${error.message}`);
  }
}

// ── Run ─────────────────────────────────────────────────────
try {
  await crawler.run(SEARCH_URLS);
} catch (error) {
  console.error('Crawler error:', error.message);
}

db.prepare(`
  UPDATE crawl_jobs SET
    status = 'completed',
    boats_found = ?,
    boats_scraped = ?,
    completed_at = datetime('now')
  WHERE id = ?
`).run(boatsInserted + boatsUpdated, boatsInserted, jobId);

console.log(`\n✅ BoatTrader crawl complete!`);
console.log(`   Pages processed: ${pagesProcessed}`);
console.log(`   Boats inserted: ${boatsInserted}`);
console.log(`   Boats updated: ${boatsUpdated}`);
console.log(`   Database: ${dbPath}`);

const stats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT make) as makes FROM boats').get();
console.log(`\n📊 Database Summary:`);
console.log(`   Total boats: ${stats.total}`);
console.log(`   Unique makes: ${stats.makes}`);

const priceStats = db.prepare("SELECT MIN(CAST(price AS INTEGER)) as min_price, MAX(CAST(price AS INTEGER)) as max_price, ROUND(AVG(CAST(price AS INTEGER))) as avg_price FROM boats WHERE price IS NOT NULL AND CAST(price AS INTEGER) > 0").get();
if (priceStats?.min_price) {
  console.log(`   Price range: $${parseInt(priceStats.min_price).toLocaleString()} - $${parseInt(priceStats.max_price).toLocaleString()}`);
  console.log(`   Average price: $${parseInt(priceStats.avg_price).toLocaleString()}`);
}

db.close();
