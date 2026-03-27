#!/usr/bin/env node
/**
 * Crawl 40-60ft sportfish/convertible power boats from YachtWorld.
 * Uses Playwright + Crawlee.
 *
 * YachtWorld URL structure (slash-based params):
 *   /boats-for-sale/condition-used/type-power/class-power-convertible/length-40,60/price-0,1000000/
 *
 * Listing detail pages:
 *   /yacht/<slug>-<numeric-id>/
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
const MIN_PRICE = parseInt(process.env.MIN_PRICE || '50000', 10);
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '1000000', 10);
const HEADLESS = process.env.HEADLESS !== 'false';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '100', 10);
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '2', 10);

// YachtWorld correct URL paths (slash-based filters, not query params)
const SEARCH_CLASSES = [
  'power-convertible',
  'power-sportfish',
  'power-sport-fishing',
  'power-walkaround',
  'power-center-console',
  'power-express',
  'power-fishing',
  'power-flats',
  'power-bay',
];
const SEARCH_URLS = SEARCH_CLASSES.map((cls) =>
  `https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-${cls}/length-${LENGTH_MIN},${LENGTH_MAX}/price-${MIN_PRICE},${MAX_PRICE}/`,
);

console.log('🚤 Starting YachtWorld crawl...');
console.log(`   Search: ${LENGTH_MIN}-${LENGTH_MAX}ft convertible/sportfish, under $${MAX_PRICE.toLocaleString()}`);
console.log(`   Classes: ${SEARCH_CLASSES.join(', ')}`);
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

  preNavigationHooks: [
    async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    },
  ],

  async requestHandler({ request, page, log }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500 + Math.random() * 1000);

    const title = await page.title();
    if (title.includes('403') || title.includes('Access Denied') || title.includes('moment')) {
      throw new Error('Request blocked - received 403 status code');
    }

    // Detail page: /yacht/<slug>-<id>/
    if (request.url.includes('/yacht/')) {
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
  log.info(`📄 Page ${pagesProcessed}: scanning YachtWorld results`);

  // Scroll to trigger lazy-loaded listings
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Extract listing links: /yacht/<slug>-<numeric-id>/
  const listings = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const allLinks = [...document.querySelectorAll('a[href*="/yacht/"]')];

    for (const link of allLinks) {
      const href = link.href;
      if (!href || seen.has(href)) continue;
      if (!/\/yacht\/[\w-]+-\d+\/?$/.test(href)) continue;

      seen.add(href);
      results.push({
        url: href,
        searchText: link.textContent?.trim()?.slice(0, 120) || '',
      });
    }
    return results;
  });

  log.info(`   Found ${listings.length} listing links`);

  for (const listing of listings) {
    if (visitedUrls.has(listing.url)) continue;
    visitedUrls.add(listing.url);

    await crawler.addRequests([{
      url: listing.url,
      userData: { searchListing: listing },
    }]);
  }

  // Find next page link
  if (pagesProcessed < MAX_PAGES) {
    const nextUrl = await page.evaluate(() => {
      // YachtWorld pagination: look for next arrow or page+1 link
      const nextBtn = document.querySelector('a[aria-label="Next page"], a[rel="next"], [class*="pagination"] a:last-of-type');
      if (nextBtn?.href) return nextBtn.href;

      // Try finding page number links
      const pageLinks = [...document.querySelectorAll('a')].filter((a) => /page=\d+|\/page\/\d+/.test(a.href));
      const currentPage = pageLinks.find((a) => a.className?.includes('active') || a.getAttribute('aria-current'));
      const currentNum = parseInt(currentPage?.textContent || '1', 10);
      const nextPage = pageLinks.find((a) => parseInt(a.textContent || '0', 10) === currentNum + 1);
      return nextPage?.href || null;
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
    await page.waitForSelector('h1', { timeout: 15000 }).catch(() => {});

    const boatData = await page.evaluate((sourceUrl) => {
      const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;

      // Title: "2005 Hatteras 50 Convertible"
      const title = getText('h1') || '';
      const titleMatch = title.match(/^(\d{4})?\s*(.+)/);
      const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null;
      const makeModel = titleMatch?.[2]?.trim() || '';
      const parts = makeModel.split(/\s+/);
      const make = parts[0] || null;
      const model = parts.slice(1).join(' ') || null;

      // Price
      const priceEls = document.querySelectorAll('[class*="price"], [data-testid*="price"]');
      let price = null;
      for (const el of priceEls) {
        const m = el.textContent?.match(/US?\$\s*([\d,]+)/);
        if (m) { price = m[1].replace(/,/g, ''); break; }
      }

      // Length — extract from title first (e.g. "Hatteras 50" → 50)
      // Title usually has the model number which IS the length for these boats
      let length = null;
      const titleLenMatch = makeModel.match(/\b(\d{2})\b/);
      if (titleLenMatch) {
        const titleLen = parseInt(titleLenMatch[1], 10);
        if (titleLen >= 30 && titleLen <= 80) length = String(titleLen);
      }
      // Fallback: look for explicit "XX ft" patterns (not random small numbers)
      if (!length) {
        const specEls = document.querySelectorAll('[class*="spec"], [class*="detail"], dt, dd, th, td');
        for (const el of specEls) {
          const m = el.textContent?.match(/(\d{2,3})\s*(?:ft|feet|foot|\x27)/i);
          if (m && parseInt(m[1], 10) >= 30 && parseInt(m[1], 10) <= 80) {
            length = m[1];
            break;
          }
        }
      }

      // Location
      const location = getText('[class*="location"], [class*="dealer"]') || '';
      const locMatch = location.match(/([^|]+)\|\s*(.+)/);
      const broker = locMatch ? locMatch[1].trim() : '';
      const locPart = locMatch ? locMatch[2].trim() : location;
      const locParts = locPart.split(',').map((s) => s.trim());
      const city = locParts[0] || null;
      const state = locParts.length >= 2 ? locParts[locParts.length - 1]?.replace(/\s*\d+.*/, '').trim() : null;

      // Description
      const description = getText('[class*="description"], [class*="detail-text"]') || '';

      // Images
      const images = [...document.querySelectorAll('img[src*="images.boats"], img[src*="images.yachtworld"]')]
        .map((img) => img.src || '')
        .filter((src) => src.startsWith('http'))
        .slice(0, 20);

      const sellerType = broker ? 'Dealer' : null;
      const idMatch = sourceUrl.match(/-(\d+)\/?$/);
      const listingId = idMatch ? `yw-${idMatch[1]}` : null;

      return {
        listingId,
        url: sourceUrl,
        make,
        model,
        year,
        length,
        price,
        location: locPart,
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
      log.warning(`   Skipping: insufficient data`);
      return;
    }

    const length = parseFloat(boatData.length || '0');
    if (length > 0 && (length < LENGTH_MIN || length > LENGTH_MAX)) {
      log.info(`   Skipping: ${length}ft outside range`);
      return;
    }

    const price = parseInt(boatData.price || '0', 10);
    if (price > MAX_PRICE) {
      log.info(`   Skipping: $${price.toLocaleString()} over budget`);
      return;
    }

    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM boats WHERE url = ?').get(boatData.url);

    upsertBoat.run(
      boatData.listingId, 'yachtworld.com', boatData.url, boatData.make, boatData.model,
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

    log.info(`✅ ${boatData.year || '?'} ${boatData.make} ${boatData.model || ''} - ${boatData.city || '?'}, ${boatData.state || '?'} - $${price > 0 ? price.toLocaleString() : 'N/A'}`);
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

console.log(`\n✅ YachtWorld crawl complete!`);
console.log(`   Pages processed: ${pagesProcessed}`);
console.log(`   Boats inserted: ${boatsInserted}`);
console.log(`   Boats updated: ${boatsUpdated}`);
console.log(`   Database: ${dbPath}`);

const stats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT make) as makes FROM boats').get();
console.log(`\n📊 Database Summary:`);
console.log(`   Total boats: ${stats.total}`);
console.log(`   Unique makes: ${stats.makes}`);

db.close();
