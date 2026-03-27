#!/usr/bin/env node
/**
 * Scrape boats.com for 40-60ft fishing boats using Crawlee + Playwright.
 * 
 * Based on exploration: boats.com uses [data-listing-id] for listings
 */

import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';

const MAX_LISTINGS = parseInt(process.env.MAX_LISTINGS || '5', 10);
const SEARCH_URL = process.env.SEARCH_URL || 'https://www.boats.com/boats-for-sale/?length=40-60&type=fishing';
const HEADLESS = process.env.HEADLESS !== 'false';

console.log(`🚤 Starting boat scraper...`);
console.log(`   URL: ${SEARCH_URL}`);
console.log(`   Max listings: ${MAX_LISTINGS}`);
console.log(`   Headless: ${HEADLESS}\n`);

let scrapedCount = 0;

const crawler = new PlaywrightCrawler({
  headless: HEADLESS,
  
  launchContext: {
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },

  maxRequestsPerCrawl: MAX_LISTINGS + 1, // +1 for search page
  
  async requestHandler({ request, page, log, pushData }) {
    const url = request.url;
    const isDetailPage = url.includes('/power-boats/') || url.includes('/sail-boats/');
    
    log.info(`📄 Processing: ${url.substring(0, 80)}...`);
    
    // Wait for page load
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000); // Wait for dynamic content
    
    if (isDetailPage) {
      // Extract boat details from detail page
      try {
        const boatData = await extractBoatDetails(page, log);
        if (boatData && Object.keys(boatData).length > 2) { // Has more than just url/timestamp
          await pushData(boatData);
          scrapedCount++;
          log.info(`✅ [${scrapedCount}/${MAX_LISTINGS}] ${boatData.make || ''} ${boatData.model || ''} - $${boatData.price || 'N/A'}`);
          
          if (scrapedCount >= MAX_LISTINGS) {
            log.info(`\n🎯 Reached max listings. Stopping...`);
            await crawler.autoscaledPool.abort();
          }
        }
      } catch (error) {
        log.error(`Failed to extract details: ${error.message}`);
      }
    } else {
      // Search results page - find listing links
      try {
        log.info('🔍 Finding boat listings on search page...');
        
        // Use the [data-listing-id] selector we discovered
        const listingLinks = await page.$$eval('[data-listing-id]', (listings, maxListings) => {
          return listings
            .map(listing => {
              const link = listing.querySelector('a[href*="/power-boats/"], a[href*="/sail-boats/"]');
              if (!link) return null;
              
              const listingId = listing.getAttribute('data-listing-id');
              const href = link.href || link.getAttribute('href');
              const fullUrl = href?.startsWith('http') ? href : `https://www.boats.com${href}`;
              
              return {
                url: fullUrl,
                listingId,
              };
            })
            .filter(item => item && item.url)
            .slice(0, maxListings); // Limit to max
        }, MAX_LISTINGS);
        
        log.info(`Found ${listingLinks.length} boat listings`);
        
        // Enqueue detail pages
        for (const item of listingLinks) {
          if (scrapedCount >= MAX_LISTINGS) break;
          await crawler.addRequests([{
            url: item.url,
            userData: { listingId: item.listingId },
          }]);
        }
      } catch (error) {
        log.error(`Error finding listings: ${error.message}`);
      }
    }
  },
  
  failedRequestHandler({ request, log }) {
    log.error(`❌ Failed: ${request.url}`);
  },
  
  maxConcurrency: 2,
  requestHandlerTimeoutSecs: 60,
});

/**
 * Extract boat details from detail page
 */
async function extractBoatDetails(page, log) {
  const data = {
    url: page.url(),
    scrapedAt: new Date().toISOString(),
    source: 'boats.com',
  };

  try {
    // Extract from page title (usually "YEAR MAKE MODEL - boats.com")
    const title = await page.title().catch(() => '');
    data.title = title;
    
    // Parse title for make/model/year
    const titleMatch = title.match(/(\d{4})\s+(.+?)\s+-\s+boats\.com/i);
    if (titleMatch) {
      data.year = titleMatch[1];
      const makeModel = titleMatch[2].trim();
      const parts = makeModel.split(/\s+/);
      if (parts.length >= 1) {
        data.make = parts[0];
        data.model = parts.slice(1).join(' ');
      }
    }
    
    // Extract price - look for common price patterns
    const priceText = await page.textContent('body').catch(() => '');
    const priceMatches = [
      ...priceText.matchAll(/\$([\d,]+)/g),
    ];
    
    // Find the largest price (likely the boat price, not other prices on page)
    const prices = priceMatches
      .map(m => parseInt(m[1].replace(/,/g, ''), 10))
      .filter(p => p > 1000 && p < 50000000); // Reasonable boat price range
    
    if (prices.length > 0) {
      data.price = Math.max(...prices).toString();
    }
    
    // Try to find structured data
    const jsonLd = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data['@type'] === 'Product' || data.name) return data;
        } catch (e) {}
      }
      return null;
    });
    
    if (jsonLd) {
      if (jsonLd.name && !data.model) {
        const nameParts = jsonLd.name.split(/\s+/);
        if (nameParts.length >= 2) {
          data.make = nameParts[0];
          data.model = nameParts.slice(1).join(' ');
        }
      }
      if (jsonLd.description) data.description = jsonLd.description;
      if (jsonLd.offers?.price && !data.price) {
        data.price = jsonLd.offers.price.toString();
      }
    }
    
    // Extract location from common patterns
    const locationMatch = priceText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z]{2})/);
    if (locationMatch) {
      data.location = `${locationMatch[1]}, ${locationMatch[2]}`;
    }
    
    // Extract length if mentioned
    const lengthMatch = priceText.match(/(\d+)\s*(?:ft|feet|')\s*(?:LOA|length)/i);
    if (lengthMatch) {
      data.length = lengthMatch[1];
    }
    
    // Extract images
    const images = await page.$$eval('img[src*="boat"], img[alt*="boat"], .boat-image img', imgs => 
      imgs
        .map(img => img.src || img.getAttribute('data-src'))
        .filter(src => src && !src.includes('logo') && !src.includes('icon') && src.startsWith('http'))
        .slice(0, 5)
    ).catch(() => []);
    
    if (images.length > 0) {
      data.images = images;
    }
    
    // Get full page text for later analysis
    const fullText = await page.textContent('body').catch(() => '');
    if (fullText) {
      data.fullText = fullText.substring(0, 5000); // First 5000 chars
    }
    
  } catch (error) {
    log.warning(`Error extracting details: ${error.message}`);
  }

  return data;
}

// Start crawling
async function main() {
  try {
    await crawler.addRequests([SEARCH_URL]);
    await crawler.run();
    
    console.log(`\n✅ Scraping complete!`);
    console.log(`   Total boats scraped: ${scrapedCount}`);
    console.log(`   Results saved to: ./storage/datasets/default/`);
    console.log(`\n   To view results:`);
    console.log(`   cat ./storage/datasets/default/*.json | jq`);
    
  } catch (error) {
    console.error(`\n❌ Scraper failed: ${error.message}`);
    process.exit(1);
  }
}

main();
