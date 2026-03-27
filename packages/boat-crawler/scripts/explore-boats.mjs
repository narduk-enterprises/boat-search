#!/usr/bin/env node
/**
 * Exploratory test script to understand boats.com structure
 * Uses Crawlee PlaywrightCrawler with simple exploration
 */

import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';

const SEARCH_URL = 'https://www.boats.com/boats-for-sale/?length=40-60&type=fishing';

console.log('🔍 Exploring boats.com structure...\n');

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: false, // Show browser for exploration
    },
  },
  maxRequestsPerCrawl: 3, // Just explore a few pages
  
  async requestHandler({ request, page, log, pushData }) {
    log.info(`📄 Processing: ${request.url}`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
      log.warning('Network idle timeout');
    });
    
    // Wait a bit for dynamic content
    await page.waitForTimeout(3000);
    
    // Explore the page structure
    log.info('Exploring page structure...');
    
    // Try to find listing links
    const listingLinks = await page.$$eval('a[href*="/boats-for-sale/"]', (links) => {
      return links
        .map(link => ({
          href: link.href,
          text: link.textContent?.trim().substring(0, 100),
          class: link.className,
        }))
        .filter(link => 
          link.href.includes('/boats-for-sale/') && 
          !link.href.includes('?length=') && 
          !link.href.includes('?type=')
        )
        .slice(0, 5); // Just first 5 for exploration
    }).catch(err => {
      log.warning(`Error finding links: ${err.message}`);
      return [];
    });
    
    log.info(`Found ${listingLinks.length} potential listing links`);
    
    // Log the structure we found
    if (listingLinks.length > 0) {
      log.info('Sample links:');
      listingLinks.forEach((link, i) => {
        log.info(`  ${i + 1}. ${link.text?.substring(0, 60)}... -> ${link.href}`);
      });
    }
    
    // Try to extract boat data from search results page
    const searchResults = await page.evaluate(() => {
      const results = [];
      
      // Look for common boat listing patterns
      const selectors = [
        'article',
        '[data-listing-id]',
        '.boat-listing',
        '.listing-card',
        '[class*="listing"]',
        '[class*="boat"]',
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach((el, idx) => {
            if (idx < 3) { // Just first 3
              const text = el.textContent?.trim().substring(0, 200);
              const link = el.querySelector('a')?.href;
              results.push({
                selector,
                text,
                link,
                html: el.outerHTML.substring(0, 300),
              });
            }
          });
          break; // Found something with this selector
        }
      }
      
      return results;
    }).catch(err => {
      log.warning(`Error extracting search results: ${err.message}`);
      return [];
    });
    
    log.info(`Found ${searchResults.length} potential listing elements`);
    
    // Save exploration data
    await pushData({
      url: request.url,
      listingLinks,
      searchResults,
      timestamp: new Date().toISOString(),
    });
    
    // If we found listing links, enqueue the first one to explore detail page
    if (listingLinks.length > 0 && request.userData?.isSearchPage !== false) {
      const firstLink = listingLinks[0].href;
      log.info(`\n🔗 Enqueueing detail page: ${firstLink}`);
      await crawler.addRequests([{
        url: firstLink,
        userData: { isDetailPage: true },
      }]);
    }
  },
  
  failedRequestHandler({ request, log }) {
    log.error(`❌ Failed: ${request.url}`);
  },
});

// Start with search page
await crawler.addRequests([{
  url: SEARCH_URL,
  userData: { isSearchPage: true },
}]);

console.log('Starting crawler...\n');
await crawler.run();

console.log('\n✅ Exploration complete!');
console.log('Check ./storage/datasets/default/ for results');
