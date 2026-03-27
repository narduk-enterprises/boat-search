#!/usr/bin/env node
/**
 * Debug script: open a search page in Playwright and dump the HTML structure
 * to figure out the correct CSS selectors for scraping.
 *
 * Usage: node scripts/debug-selectors.mjs <url>
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const urls = [
  'https://www.boattrader.com/boats/type-power/class-sportfish-convertible/?length=40-60&price=,1000000',
  'https://www.yachtworld.com/boats-for-sale/type-power/class-sportfish-convertible/?length=40-60&price=0-1000000&country=united-states',
];

const targetUrl = process.argv[2] || urls[0];

console.log(`🔍 Debugging selectors for: ${targetUrl}\n`);

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = await browser.newPage();
await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

const title = await page.title();
console.log(`📄 Page title: ${title}`);

// Dump all links
const linkAnalysis = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a')];
  const boatLinks = links
    .filter((a) => a.href && (a.href.includes('/boat') || a.href.includes('/yacht') || a.href.includes('/listing')))
    .map((a) => ({
      href: a.href,
      text: a.textContent?.trim().slice(0, 80),
      classes: a.className,
      parent: a.parentElement?.tagName + '.' + (a.parentElement?.className || '').slice(0, 50),
    }));

  const allLinks = links.slice(0, 30).map((a) => ({
    href: a.href?.slice(0, 100),
    text: a.textContent?.trim().slice(0, 50),
  }));

  return {
    totalLinks: links.length,
    boatLinks: boatLinks.slice(0, 20),
    sampleLinks: allLinks,
  };
});

console.log(`\n📊 Total links: ${linkAnalysis.totalLinks}`);
console.log(`🔗 Boat detail links: ${linkAnalysis.boatLinks.length}`);

if (linkAnalysis.boatLinks.length > 0) {
  console.log('\n── Boat Links ──');
  for (const link of linkAnalysis.boatLinks.slice(0, 10)) {
    console.log(`  ${link.href}`);
    console.log(`    text: ${link.text}`);
    console.log(`    class: ${link.classes}`);
    console.log(`    parent: ${link.parent}`);
  }
} else {
  console.log('\n⚠ No boat detail links found! Dumping sample links:');
  for (const link of linkAnalysis.sampleLinks) {
    console.log(`  ${link.href} → ${link.text}`);
  }
}

// Dump DOM structure hints
const structure = await page.evaluate(() => {
  // Check for common listing containers
  const checks = [
    '[data-testid]', '.boat-card', '.listing-card', '.search-result',
    '.boat-listing', '.result-item', 'article', '[class*="Card"]',
    '[class*="listing"]', '[class*="result"]', '[class*="boat"]',
  ];

  const results = {};
  for (const sel of checks) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      results[sel] = {
        count: els.length,
        sample: els[0]?.outerHTML?.slice(0, 200),
      };
    }
  }

  // Grab first 500 chars of main content area
  const main = document.querySelector('main, #main, [role="main"], .content, #content');
  const mainText = main?.textContent?.trim().slice(0, 500) || 'no main element found';

  return { selectors: results, mainContent: mainText };
});

console.log('\n── DOM Structure ──');
for (const [sel, info] of Object.entries(structure.selectors)) {
  console.log(`  ${sel}: ${info.count} elements`);
  console.log(`    sample: ${info.sample}`);
}

console.log('\n── Main Content (first 500 chars) ──');
console.log(structure.mainContent);

// Save full HTML to file for manual inspection
const html = await page.content();
const outPath = join(__dirname, '..', 'data', 'debug-page.html');
writeFileSync(outPath, html);
console.log(`\n💾 Full HTML saved to: ${outPath}`);

await browser.close();
