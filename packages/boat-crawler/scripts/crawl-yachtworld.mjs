#!/usr/bin/env node
/**
 * Crawl used power / fishing-family boats from YachtWorld.
 * Uses Playwright + Crawlee.
 *
 * Anti-bot posture: puppeteer-extra stealth (optional), incognito contexts, viewport + client-hint
 * headers, init-script hardening, optional header cleanup via route.continue, human-like mouse
 * nudge during challenges, cookie persistence hooks, and debug screenshots — see
 * https://alterlab.io/blog/playwright-anti-bot-detection-what-actually-works-in-2026
 *
 * YachtWorld URL structure (slash-based params):
 *   /boats-for-sale/condition-used/type-power/class-<class>/length-A,B/price-C,D/
 *
 * Listing detail pages:
 *   /yacht/<slug>-<numeric-id>/
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import { chromium as chromiumStealth } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { chromium as chromiumPlain } from 'playwright';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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
const USE_STEALTH = process.env.USE_STEALTH !== 'false';
/** Strip automation-ish headers on outbound requests (AlterLab-style); set YW_STRIP_HEADERS=false to disable. */
const STRIP_AUTOMATION_HEADERS = process.env.YW_STRIP_HEADERS !== 'false';
/** Save PNGs when challenges/timeouts fire (YW_DEBUG_SCREENSHOTS=true). */
const DEBUG_SCREENSHOTS = process.env.YW_DEBUG_SCREENSHOTS === 'true';
/** Playwright cookie JSON array (from a prior run or manual export). */
const YW_COOKIES_PATH = process.env.YW_COOKIES_PATH?.trim() || '';
/** After crawl, write context cookies here (helps next run look more “returning”). */
const YW_SAVE_COOKIES_PATH = process.env.YW_SAVE_COOKIES_PATH?.trim() || '';
const DEBUG_SHOT_DIR = join(__dirname, '..', 'data', 'debug-yachtworld');

/** Fishing-forward class order: sportfish / CC / walkaround first, then broader power. */
const SEARCH_CLASSES = [
  'power-sportfish',
  'power-sport-fishing',
  'power-center-console',
  'power-walkaround',
  'power-bay',
  'power-flats',
  'power-fishing',
  'power-convertible',
  'power-express',
];

const SEARCH_URLS = SEARCH_CLASSES.map(
  (cls) =>
    `https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-${cls}/length-${LENGTH_MIN},${LENGTH_MAX}/price-${MIN_PRICE},${MAX_PRICE}/`,
);

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
];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VIEWPORT = { width: 1920, height: 1080 };

/** Client hints aligned with USER_AGENT (see browser context hardening in anti-bot guides). */
const BROWSER_EXTRA_HEADERS = {
  'Accept-Language': process.env.YW_ACCEPT_LANGUAGE || 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

if (USE_STEALTH) {
  chromiumStealth.use(StealthPlugin());
}

const browserLauncher = USE_STEALTH ? chromiumStealth : chromiumPlain;

console.log('🚤 Starting YachtWorld crawl...');
console.log(`   Search: ${LENGTH_MIN}-${LENGTH_MAX}ft, $${MIN_PRICE.toLocaleString()}-$${MAX_PRICE.toLocaleString()}`);
console.log(`   Classes (${SEARCH_CLASSES.length}): ${SEARCH_CLASSES.join(', ')}`);
console.log(`   Max pages: ${MAX_PAGES} per search stream`);
console.log(`   Max concurrency: ${MAX_CONCURRENCY}`);
console.log(`   Headless: ${HEADLESS}`);
console.log(`   Stealth plugin: ${USE_STEALTH}`);
console.log(`   Strip automation headers (route): ${STRIP_AUTOMATION_HEADERS}`);
console.log(`   Debug screenshots: ${DEBUG_SCREENSHOTS}`);
if (YW_COOKIES_PATH) console.log(`   Cookie load: ${YW_COOKIES_PATH}`);
if (YW_SAVE_COOKIES_PATH) console.log(`   Cookie save: ${YW_SAVE_COOKIES_PATH}`);
console.log('');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const job = db
  .prepare(`
  INSERT INTO crawl_jobs (search_url, status, started_at)
  VALUES (?, 'running', datetime('now'))
`)
  .run(SEARCH_URLS.join('\n'));
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

let searchPagesProcessed = 0;
let detailPagesProcessed = 0;
let boatsInserted = 0;
let boatsUpdated = 0;
const visitedListingUrls = new Set();
const visitedSearchPageUrls = new Set();

console.log(`📊 Created crawl job #${jobId}\n`);

function looksBlockedTitle(title) {
  const t = (title || '').toLowerCase();
  return BLOCK_TITLE_SUBSTRINGS.some((s) => t.includes(s));
}

function normalizeSearchPageUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

function looksChallengeHtml(html) {
  const h = (html || '').slice(0, 18_000).toLowerCase();
  if (h.includes('__cf_chl') || h.includes('cf-chl-bypass') || h.includes('cf-browser-verification')) {
    return true;
  }
  if (h.includes('checking your browser') && h.includes('cloudflare')) {
    return true;
  }
  if (h.includes('just a moment') && h.includes('cloudflare')) {
    return true;
  }
  if (h.includes('challenges.cloudflare.com/turnstile') && h.includes('cf-turnstile-response')) {
    return true;
  }
  return false;
}

async function gentleHumanPulse(page) {
  const vp = page.viewportSize();
  const w = vp?.width ?? VIEWPORT.width;
  const h = vp?.height ?? VIEWPORT.height;
  const x = 100 + Math.floor(Math.random() * Math.max(80, w - 200));
  const y = 100 + Math.floor(Math.random() * Math.max(80, h - 200));
  await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 15) }).catch(() => {});
}

async function loadPlaywrightCookiesIntoContext(context, filePath) {
  if (!filePath || !existsSync(filePath)) {
    return;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    const cookies = Array.isArray(parsed) ? parsed : parsed.cookies;
    if (Array.isArray(cookies) && cookies.length > 0) {
      await context.addCookies(cookies);
    }
  } catch {
    /* ignore bad cookie file */
  }
}

async function savePlaywrightCookiesFromContext(context, filePath) {
  if (!filePath) {
    return;
  }
  try {
    const cookies = await context.cookies();
    writeFileSync(filePath, `${JSON.stringify(cookies, null, 2)}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

async function debugScreenshot(page, slug) {
  if (!DEBUG_SCREENSHOTS) {
    return;
  }
  try {
    mkdirSync(DEBUG_SHOT_DIR, { recursive: true });
    const safe = slug.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 80);
    const path = join(DEBUG_SHOT_DIR, `${Date.now()}_${safe}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`   📸 Debug screenshot: ${path}`);
  } catch {
    /* ignore */
  }
}

/**
 * Per-page hardening inspired by Playwright anti-bot guides (viewport, headers, init scripts, optional route).
 * @see https://alterlab.io/blog/playwright-anti-bot-detection-what-actually-works-in-2026
 */
async function setupHardenedPlaywrightPage(page) {
  await page.setViewportSize(VIEWPORT);
  await page.setExtraHTTPHeaders(BROWSER_EXTRA_HEADERS);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    try {
      delete Object.getPrototypeOf(navigator).webdriver;
    } catch {
      /* ignore */
    }
    window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {} };
    const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });

  if (STRIP_AUTOMATION_HEADERS) {
    await page.route('**/*', async (route) => {
      const req = route.request();
      const headers = { ...req.headers() };
      delete headers['x-playwright'];
      delete headers['x-devtools'];
      if (req.resourceType() === 'document') {
        headers.Accept =
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
        headers['Upgrade-Insecure-Requests'] = '1';
      }
      await route.continue({ headers });
    });
  }

  await loadPlaywrightCookiesIntoContext(page.context(), YW_COOKIES_PATH);
}

async function tryDismissConsent(page) {
  const selectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("I Accept")',
    'button:has-text("Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    '[aria-label="Accept"]',
    'button:has-text("Continue")',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible({ timeout: 600 }).catch(() => false)) {
      await loc.click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(400);
      break;
    }
  }
}

/**
 * Wait through Cloudflare / consent / slow SPA until we see real content or time out.
 */
async function settlePage({ page, log, isDetail }) {
  await page.waitForLoadState('domcontentloaded', { timeout: 25000 }).catch(() => {});
  await tryDismissConsent(page);

  const deadline = Date.now() + 90000;
  let lastTitle = '';

  while (Date.now() < deadline) {
    await page.waitForTimeout(700 + Math.floor(Math.random() * 500));
    await tryDismissConsent(page);

    const title = await page.title().catch(() => '');
    lastTitle = title;
    const html = await page.content().catch(() => '');
    const challenge = looksChallengeHtml(html);

    if (challenge || looksBlockedTitle(title)) {
      if (challenge) {
        log.info('   Challenge markers in HTML (e.g. Cloudflare) — waiting…');
      } else {
        log.info(`   Interstitial/challenge (title: "${title.slice(0, 70)}") — waiting…`);
      }
      await gentleHumanPulse(page);
      continue;
    }

    if (isDetail) {
      const ok = await page
        .locator('h1')
        .first()
        .isVisible()
        .catch(() => false);
      if (ok) {
        return;
      }
    } else {
      const n = await page.locator('a[href*="/yacht/"]').count().catch(() => 0);
      if (n >= 1) {
        return;
      }
      const body = await page.locator('body').innerText().catch(() => '');
      if (/no\s+boats?\s+match|no\s+results|0\s+results|no\s+listings?\s+found/i.test(body)) {
        log.info('   Search page reports no results — continuing.');
        return;
      }
    }
  }

  log.warning(
    `   Page settle timeout (last title: "${lastTitle.slice(0, 80)}") — continuing with best effort`,
  );
  await debugScreenshot(page, `settle-timeout-${isDetail ? 'detail' : 'search'}`);
}

const crawler = new PlaywrightCrawler({
  headless: HEADLESS,
  launchContext: {
    launcher: browserLauncher,
    userAgent: USER_AGENT,
    /** Fresh incognito contexts — pairs well with per-page hardening / cookies. */
    useIncognitoPages: true,
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    },
  },
  browserPoolOptions: {
    postPageCreateHooks: [
      async (page) => {
        await setupHardenedPlaywrightPage(page);
      },
    ],
    prePageCloseHooks: YW_SAVE_COOKIES_PATH
      ? [
          async (page) => {
            await savePlaywrightCookiesFromContext(page.context(), YW_SAVE_COOKIES_PATH);
          },
        ]
      : [],
  },
  maxRequestsPerCrawl: Math.max(MAX_PAGES * SEARCH_URLS.length * 3, 800),
  maxConcurrency: MAX_CONCURRENCY,
  requestHandlerTimeoutSecs: 120,

  async requestHandler({ request, page, log }) {
    const isDetail = request.url.includes('/yacht/');

    await settlePage({ page, log, isDetail });

    const title = await page.title().catch(() => '');
    if (looksBlockedTitle(title) && !isDetail) {
      await debugScreenshot(page, 'search-blocked-after-settle');
      throw new Error(`YachtWorld search still blocked after settle: "${title.slice(0, 120)}"`);
    }

    if (isDetail) {
      await handleDetailPage({ request, page, log });
    } else {
      await handleSearchPage({ request, page, log });
    }
  },

  async failedRequestHandler({ request, log, page }) {
    log.error(`❌ Failed: ${request.url}`);
    if (page) {
      await debugScreenshot(page, 'failed-request');
    }
  },
});

async function handleSearchPage({ request, page, log }) {
  const streamSeed = request.userData?.ywStreamSeed || request.url;
  const streamPageIndex = request.userData?.ywStreamPageIndex || 1;

  const pageKey = normalizeSearchPageUrl(request.url);
  if (visitedSearchPageUrls.has(pageKey)) {
    log.info(`↩️  Skip duplicate search URL: ${pageKey.slice(0, 100)}`);
    return;
  }
  visitedSearchPageUrls.add(pageKey);

  searchPagesProcessed += 1;
  log.info(
    `📄 Search page #${searchPagesProcessed} (stream page ${streamPageIndex}/${MAX_PAGES}, seed class path: …${streamSeed.slice(-55)})`,
  );

  await page
    .waitForSelector('a[href*="/yacht/"]', { timeout: 20000 })
    .catch(() => {});

  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 650));
    await page.waitForTimeout(350 + Math.floor(Math.random() * 120));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const listings = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const anchors = [...document.querySelectorAll('a[href*="/yacht/"]')];

    function normalizeListingUrl(href) {
      try {
        const u = new URL(href, 'https://www.yachtworld.com');
        if (!/\.yachtworld\.com$/i.test(u.hostname)) {
          return null;
        }
        const path = u.pathname.replace(/\/+$/, '');
        const m = path.match(/\/yacht\/(.+)-(\d+)$/);
        if (!m) {
          return null;
        }
        return `https://www.yachtworld.com/yacht/${m[1]}-${m[2]}/`;
      } catch {
        return null;
      }
    }

    for (const link of anchors) {
      const href = link.href || link.getAttribute('href');
      if (!href) {
        continue;
      }
      const canonical = normalizeListingUrl(href);
      if (!canonical || seen.has(canonical)) {
        continue;
      }
      seen.add(canonical);
      results.push({
        url: canonical,
        searchText: link.textContent?.trim()?.slice(0, 160) || '',
      });
    }
    return results;
  });

  log.info(`   Found ${listings.length} listing links (after normalize)`);

  let newlyQueued = 0;
  for (const listing of listings) {
    if (visitedListingUrls.has(listing.url)) {
      continue;
    }
    visitedListingUrls.add(listing.url);
    newlyQueued += 1;

    await crawler.addRequests([
      {
        url: listing.url,
        userData: { searchListing: listing, ywSourceStream: streamSeed },
      },
    ]);
  }
  log.info(`   Enqueued ${newlyQueued} new detail URLs (${visitedListingUrls.size} unique listings total)`);

  if (streamPageIndex >= MAX_PAGES) {
    log.info(`   Stream hit MAX_PAGES=${MAX_PAGES}, not paginating this stream further`);
    return;
  }

  const nextUrl = await page.evaluate(() => {
    const relNext = document.querySelector('a[rel="next"]');
    if (relNext?.href) {
      return relNext.href;
    }

    const ariaNext = document.querySelector('a[aria-label*="ext" i], a[aria-label*="Next" i]');
    if (ariaNext?.href && !/prev/i.test(ariaNext.getAttribute('aria-label') || '')) {
      return ariaNext.href;
    }

    const candidates = [...document.querySelectorAll('a[href]')];
    const nextByText = candidates.find((a) => {
      const t = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return t === 'next' || t === '›' || t === '»' || t === '→';
    });
    if (nextByText?.href) {
      return nextByText.href;
    }

    const pageLinks = candidates.filter((a) => /[?&]page=\d+|\/page\/\d+/i.test(a.href));
    const nums = pageLinks
      .map((a) => ({
        href: a.href,
        n: parseInt((a.textContent || '').replace(/\D/g, ''), 10),
        active:
          a.className?.includes('active') ||
          a.getAttribute('aria-current') === 'page' ||
          a.getAttribute('aria-selected') === 'true',
      }))
      .filter((x) => Number.isFinite(x.n));

    let current = nums.find((x) => x.active)?.n;
    if (current == null) {
      current = 1;
    }
    const nextNum = nums.find((x) => x.n === current + 1);
    return nextNum?.href || null;
  });

  if (!nextUrl) {
    log.info('   No next page link found for this stream');
    return;
  }

  const nextKey = normalizeSearchPageUrl(nextUrl);
  if (visitedSearchPageUrls.has(nextKey)) {
    log.info(`   Next URL already visited, skipping: ${nextKey.slice(0, 90)}`);
    return;
  }

  log.info(`   Enqueueing next search page (stream page ${streamPageIndex + 1})`);
  await crawler.addRequests([
    {
      url: nextUrl,
      userData: {
        ywStreamSeed: streamSeed,
        ywStreamPageIndex: streamPageIndex + 1,
      },
    },
  ]);
}

async function handleDetailPage({ request, page, log }) {
  detailPagesProcessed += 1;
  try {
    await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {});

    const boatData = await page.evaluate(
      ({ sourceUrl, lenMin, lenMax }) => {
        const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
        const getMeta = (prop) =>
          document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute('content')?.trim() ||
          null;

        let ld = null;
        for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const j = JSON.parse(node.textContent || '');
            const stack = Array.isArray(j) ? j : [j];
            for (const item of stack) {
              if (item && typeof item === 'object' && item['@graph']) {
                for (const g of item['@graph']) {
                  if (g && (g.name || g.offers)) {
                    ld = g;
                    break;
                  }
                }
              } else if (item && (item.name || item.offers)) {
                ld = item;
                break;
              }
            }
            if (ld) {
              break;
            }
          } catch {
            /* ignore */
          }
        }

        const title = getText('h1') || ld?.name || '';
        const titleMatch = title.match(/^(\d{4})?\s*(.+)/);
        const year = titleMatch?.[1] ? parseInt(titleMatch[1], 10) : null;
        const makeModel = titleMatch?.[2]?.trim() || '';
        const parts = makeModel.split(/\s+/).filter(Boolean);
        let make = parts[0] || null;
        let model = parts.slice(1).join(' ') || null;

        let price = null;
        let currency = 'USD';
        const offer = ld?.offers;
        const offerPrice =
          (typeof offer === 'object' && offer !== null && !Array.isArray(offer) ? offer.price : null) ||
          (Array.isArray(offer) && offer[0]?.price) ||
          null;
        if (offerPrice != null) {
          price = String(offerPrice).replace(/[^\d.]/g, '').split('.')[0] || null;
          const cur =
            (typeof offer === 'object' && offer !== null && !Array.isArray(offer) && offer.priceCurrency) ||
            (Array.isArray(offer) && offer[0]?.priceCurrency);
          if (cur) {
            currency = String(cur);
          }
        }

        if (!price) {
          const priceSelectors = [
            '[data-testid*="price" i]',
            '[class*="price" i]',
            '[class*="Price"]',
            '[itemprop="price"]',
          ];
          for (const sel of priceSelectors) {
            const els = document.querySelectorAll(sel);
            for (const el of els) {
              const raw = el.textContent || el.getAttribute('content') || '';
              const usd = raw.match(/(?:US\$|\$|USD)\s*([\d,]+)/i);
              const eur = raw.match(/€\s*([\d.,]+)/);
              if (usd) {
                price = usd[1].replace(/,/g, '');
                currency = 'USD';
                break;
              }
              if (eur) {
                price = eur[1].replace(/[^\d]/g, '');
                currency = 'EUR';
                break;
              }
            }
            if (price) {
              break;
            }
          }
        }

        let length = null;
        const titleLenMatch = makeModel.match(/\b(\d{1,2}(?:\.\d+)?)\s*(?:ft|')\b/i);
        if (titleLenMatch) {
          length = String(parseFloat(titleLenMatch[1]));
        }
        if (!length) {
          const lm = makeModel.match(/\b(\d{1,2})\b/);
          if (lm) {
            const n = parseInt(lm[1], 10);
            if (n >= lenMin && n <= lenMax) {
              length = String(n);
            }
          }
        }
        if (!length && ld?.description) {
          const dm = String(ld.description).match(/(\d{1,2}(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/i);
          if (dm) {
            length = String(parseFloat(dm[1]));
          }
        }
        if (!length) {
          const specEls = document.querySelectorAll(
            '[class*="spec" i], [class*="detail" i], [class*="overview" i], dt, dd, th, td, li',
          );
          for (const el of specEls) {
            const m = el.textContent?.match(/(\d{1,2}(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/i);
            if (m) {
              const v = parseFloat(m[1]);
              if (v >= lenMin && v <= lenMax + 15) {
                length = String(v);
                break;
              }
            }
          }
        }

        let location =
          getMeta('og:locality') ||
          ld?.location?.address?.addressLocality ||
          getText('[class*="location" i]') ||
          getText('[class*="dealer" i]') ||
          getText('[class*="broker" i]') ||
          '';

        const locMatch = location.match(/^([^|]+)\|\s*(.+)$/);
        const broker = locMatch ? locMatch[1].trim() : '';
        const locPart = locMatch ? locMatch[2].trim() : location;
        const locParts = locPart.split(',').map((s) => s.trim()).filter(Boolean);
        const city = locParts[0] || null;
        let state = locParts.length >= 2 ? locParts[locParts.length - 1] : null;
        if (state) {
          state = state.replace(/\s*\d+.*/, '').trim();
        }

        let description =
          getText('[class*="description" i], [class*="detail-text" i], article p') || '';
        if (!description && ld?.description) {
          description = String(ld.description);
        }

        const imgSet = new Set();
        const pushImg = (src) => {
          if (!src || !src.startsWith('http')) {
            return;
          }
          if (/placeholder|spinner|logo|icon|1x1|blank/i.test(src)) {
            return;
          }
          if (/yachtworld|boats\.com|boatimages|imtstatic|cloudfront/i.test(src)) {
            imgSet.add(src.split('?')[0]);
          }
        };

        for (const img of document.querySelectorAll(
          'img[src*="yachtworld"], img[src*="boats"], img[data-src*="yachtworld"], img[data-src*="boats"], picture source[srcset]',
        )) {
          pushImg(img.currentSrc || img.src || img.getAttribute('data-src'));
          const ss = img.getAttribute('srcset');
          if (ss) {
            const first = ss.split(',')[0]?.trim().split(/\s+/)[0];
            pushImg(first);
          }
        }
        const ogImg = getMeta('og:image');
        pushImg(ogImg);

        const images = [...imgSet].slice(0, 24);
        let sellerType = broker ? 'Dealer' : null;
        const bodyHint = (document.body?.innerText || '').slice(0, 4000);
        if (/private\s+seller|by\s+owner/i.test(bodyHint)) {
          sellerType = 'Private Seller';
        } else if (/dealer|broker|yacht\s+sales/i.test(bodyHint) && !sellerType) {
          sellerType = 'Dealer';
        }

        const idMatch = sourceUrl.match(/-(\d+)\/?(?:\?|$)/);
        const listingId = idMatch ? `yw-${idMatch[1]}` : null;

        let country = 'US';
        if (/canada|bc\b|on\b|nova scotia/i.test(locPart)) {
          country = 'CA';
        }

        return {
          listingId,
          url: sourceUrl,
          make,
          model,
          year,
          length,
          price,
          currency,
          location: locPart || location || null,
          city,
          state,
          country,
          description: description.slice(0, 5000),
          sellerType,
          listingType: 'Used',
          images: JSON.stringify(images),
          fullText: `${title} ${description}`.slice(0, 4000),
        };
      },
      { sourceUrl: request.url, lenMin: LENGTH_MIN, lenMax: LENGTH_MAX },
    );

    if (!boatData.url) {
      log.warning('   Skipping: no URL in extraction');
      return;
    }

    if (!boatData.make && !boatData.model) {
      log.warning(`   Skipping: no make/model for ${request.url}`);
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

    const currency = boatData.currency || 'USD';

    upsertBoat.run(
      boatData.listingId,
      'yachtworld.com',
      boatData.url,
      boatData.make,
      boatData.model,
      boatData.year,
      boatData.length,
      boatData.price,
      currency,
      boatData.location,
      boatData.city,
      boatData.state,
      boatData.country,
      boatData.description,
      boatData.sellerType,
      boatData.listingType,
      boatData.images,
      boatData.fullText,
      now,
      now,
      LENGTH_MIN,
      LENGTH_MAX,
      'fishing',
      'US',
    );

    if (existing) {
      boatsUpdated += 1;
    } else {
      boatsInserted += 1;
    }

    log.info(
      `✅ ${boatData.year || '?'} ${boatData.make} ${boatData.model || ''} — ${boatData.city || '?'}, ${boatData.state || '?'} — ${price > 0 ? `$${price.toLocaleString()}` : 'price N/A'} — ${boatData.length || '?'}ft`,
    );
  } catch (error) {
    log.error(`   Error scraping detail: ${error.message}`);
  }
}

async function main() {
  try {
    await crawler.addRequests(
      SEARCH_URLS.map((url) => ({
        url,
        userData: {
          ywStreamSeed: url,
          ywStreamPageIndex: 1,
        },
      })),
    );
    await crawler.run();
  } catch (error) {
    console.error('Crawler error:', error.message);
    db.prepare(`
      UPDATE crawl_jobs SET
        status = 'failed',
        error = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `).run(error.message, jobId);
    db.close();
    process.exitCode = 1;
    return;
  }

  const boatsScraped = boatsInserted + boatsUpdated;
  const boatsFound = visitedListingUrls.size;

  db.prepare(`
    UPDATE crawl_jobs SET
      status = 'completed',
      boats_found = ?,
      boats_scraped = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).run(boatsFound, boatsScraped, jobId);

  console.log(`\n✅ YachtWorld crawl complete`);
  console.log(`   Search pages processed: ${searchPagesProcessed}`);
  console.log(`   Detail pages processed: ${detailPagesProcessed}`);
  console.log(`   Unique listing URLs queued: ${boatsFound}`);
  console.log(`   Boats inserted: ${boatsInserted}`);
  console.log(`   Boats updated: ${boatsUpdated}`);
  console.log(`   Rows touched (scraped): ${boatsScraped}`);
  console.log(`   Database: ${dbPath}`);

  const stats = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT make) as makes FROM boats').get();
  console.log(`\n📊 Database Summary:`);
  console.log(`   Total boats: ${stats.total}`);
  console.log(`   Unique makes: ${stats.makes}`);

  db.close();
}

await main();
