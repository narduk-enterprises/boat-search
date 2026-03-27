#!/usr/bin/env node
/**
 * Crawl The Hull Truth classifieds for 40-60ft sportfish/convertible boats.
 * Uses Playwright + Crawlee.
 *
 * THT is a forum — classifieds are in the "Boats for Sale" subforum.
 * We search for keywords like "hatteras", "viking", "bertram", "convertible", etc.
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');

const LENGTH_MIN = 40;
const LENGTH_MAX = 60;
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '1000000', 10);
const HEADLESS = process.env.HEADLESS !== 'false';
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '50', 10);
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '2', 10);

// Keywords to search in THT classifieds
const SEARCH_KEYWORDS = [
  'hatteras convertible',
  'viking convertible',
  'bertram convertible',
  'cabo sportfish',
  'viking sportfish',
  'hatteras sportfish',
  'freeman fishing',
  'yellowfin fishing',
];

// THT classifieds search forum (Boats for Sale = forum 13)
const SEARCH_URLS = SEARCH_KEYWORDS.map((kw) =>
  `https://www.thehulltruth.com/search.php?searchid=&query=${encodeURIComponent(kw)}&titleonly=1&forumchoice%5B%5D=13&searchdate=365&order=date&showposts=0`,
);

console.log('🚤 Starting The Hull Truth crawl...');
console.log(`   Keywords: ${SEARCH_KEYWORDS.join(', ')}`);
console.log(`   Max pages: ${MAX_PAGES}`);
console.log(`   Headless: ${HEADLESS}\n`);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const job = db.prepare(`
  INSERT INTO crawl_jobs (search_url, status, started_at)
  VALUES (?, 'running', datetime('now'))
`).run('thehulltruth.com classifieds');
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
    description = excluded.description,
    seller_type = excluded.seller_type,
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
  maxRequestsPerCrawl: Math.max(MAX_PAGES * 10, 300),
  maxConcurrency: MAX_CONCURRENCY,
  requestHandlerTimeoutSecs: 90,

  async requestHandler({ request, page, log }) {
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000 + Math.random() * 1500);

    const title = await page.title();
    if (title.includes('403') || title.includes('blocked')) {
      throw new Error('Request blocked - received 403 status code');
    }

    // Detect if this is a thread page or search results
    if (request.url.includes('/showthread.php') || request.url.includes('/boats-classifieds/')) {
      await handleThreadPage({ request, page, log });
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
  log.info(`📄 Page ${pagesProcessed}: scanning THT search results`);

  // THT search results are threads in a table
  await page.waitForSelector('a[href*="showthread"], a[href*="boats-classifieds"]', { timeout: 15000 }).catch(() => {});

  const threads = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const links = document.querySelectorAll('a[href*="showthread"], a[href*="boats-classifieds"]');

    for (const link of links) {
      const href = link.href;
      if (!href || seen.has(href)) continue;
      if (href.includes('#post')) continue; // Skip direct post links

      seen.add(href);
      const title = link.textContent?.trim() || '';

      // Filter for likely boat sale threads
      if (!/sale|sell|for\s+sale|price|reduced|\$/i.test(title) &&
          !/\d{4}\s+\w+/i.test(title)) {
        continue;
      }

      results.push({ url: href, title });
    }
    return results;
  });

  log.info(`   Found ${threads.length} potential sale threads`);

  for (const thread of threads) {
    if (visitedUrls.has(thread.url)) continue;
    visitedUrls.add(thread.url);

    await crawler.addRequests([{
      url: thread.url,
      userData: { threadTitle: thread.title },
    }]);
  }

  // Next page
  if (pagesProcessed < MAX_PAGES) {
    const nextUrl = await page.evaluate(() => {
      const nextLink = document.querySelector('a[rel="next"], a.pagenav-next, td.alt1 a:last-child');
      return nextLink?.href || null;
    });

    if (nextUrl && !visitedUrls.has(nextUrl)) {
      visitedUrls.add(nextUrl);
      await crawler.addRequests([nextUrl]);
    }
  }
}

async function handleThreadPage({ request, page, log }) {
  try {
    await page.waitForSelector('#posts, .postbitlegacy, .postcontainer', { timeout: 15000 }).catch(() => {});

    const boatData = await page.evaluate((sourceUrl) => {
      // Get first post content (the sale listing)
      const firstPost = document.querySelector('.postbitlegacy .postcontent, .postcontainer .postcontent, #post_message_1, [id^="post_message_"]');
      const postText = firstPost?.textContent?.trim() || '';
      const title = document.querySelector('h1, .threadtitle')?.textContent?.trim() || '';

      // Parse title: "2005 Hatteras 50 Convertible - $450,000"
      const titleMatch = title.match(/(\d{4})?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(\d+)?\s*(.*)/i);
      const year = titleMatch?.[1] ? parseInt(titleMatch[1]) : null;
      const make = titleMatch?.[2]?.trim() || null;
      const lengthFromTitle = titleMatch?.[3] || null;
      const model = titleMatch?.[4]?.replace(/[-–—].*$/, '').trim() || null;

      // Price from title or post
      const priceMatch = (title + ' ' + postText).match(/\$\s*([\d,]+)/);
      const price = priceMatch ? priceMatch[1].replace(/,/g, '') : null;

      // Length from post
      let length = lengthFromTitle;
      if (!length) {
        const lenMatch = postText.match(/(\d+)\s*(?:ft|foot|feet|')/i);
        length = lenMatch ? lenMatch[1] : null;
      }

      // Location from post or user profile
      const locationEl = document.querySelector('.userfield-location, [class*="location"]');
      const location = locationEl?.textContent?.trim() || null;

      // Images from post
      const images = [...(firstPost?.querySelectorAll('img') || [])]
        .map((img) => img.src || '')
        .filter((src) => src.startsWith('http') && !src.includes('avatar') && !src.includes('icon') && !src.includes('smil'))
        .slice(0, 20);

      const idMatch = sourceUrl.match(/(\d+)/);
      const listingId = idMatch ? idMatch[1] : null;

      return {
        listingId,
        url: sourceUrl,
        make,
        model,
        year,
        length,
        price,
        location,
        city: null,
        state: null,
        country: 'US',
        description: postText.slice(0, 5000),
        sellerType: 'Private Seller',
        listingType: 'Used',
        images: JSON.stringify(images),
        fullText: title + ' ' + postText.slice(0, 2000),
      };
    }, request.url);

    if (!boatData.make) {
      log.warning(`   Skipping: can't parse make from "${request.userData?.threadTitle || request.url}"`);
      return;
    }

    // Length validation
    const length = parseFloat(boatData.length || '0');
    if (length > 0 && (length < LENGTH_MIN || length > LENGTH_MAX)) {
      return; // Silently skip out-of-range
    }

    // Price validation
    const price = parseInt(boatData.price || '0', 10);
    if (price > 0 && price > MAX_PRICE) {
      return; // Over budget
    }

    const now = new Date().toISOString();
    const existing = db.prepare('SELECT id FROM boats WHERE url = ?').get(boatData.url);

    upsertBoat.run(
      boatData.listingId, 'thehulltruth.com', boatData.url, boatData.make, boatData.model,
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

    log.info(`✅ ${boatData.year || '?'} ${boatData.make} ${boatData.model || ''} - ${boatData.location || 'Unknown'} - $${price > 0 ? price.toLocaleString() : 'N/A'}`);
  } catch (error) {
    log.error(`   Error scraping thread: ${error.message}`);
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

console.log(`\n✅ Hull Truth crawl complete!`);
console.log(`   Pages processed: ${pagesProcessed}`);
console.log(`   Boats inserted: ${boatsInserted}`);
console.log(`   Boats updated: ${boatsUpdated}`);
console.log(`   Database: ${dbPath}`);

const stats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT make) as makes FROM boats').get();
console.log(`\n📊 Database Summary:`);
console.log(`   Total boats: ${stats.total}`);
console.log(`   Unique makes: ${stats.makes}`);

db.close();
