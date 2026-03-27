import { chromium } from 'playwright';

// Try multiple BoatTrader URL formats to find the working one
const urls = [
  'https://www.boattrader.com/boats/?type=power&class=sportfish&length=40-60&price=0-1000000',
  'https://www.boattrader.com/boats/keyword-sportfish/?length=40-60&price=,1000000',
  'https://www.boattrader.com/boats/?keyword=sportfish+convertible&length=40-60',
  'https://www.boattrader.com/boats/keyword-convertible/?length=40-60',
];

const b = await chromium.launch({headless: false, args: ['--disable-blink-features=AutomationControlled']});
const ctx = await b.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const p = await ctx.newPage();
await p.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', {get: () => false});
});

for (const url of urls) {
  console.log('\n=== Testing:', url);
  try {
    await p.goto(url, {waitUntil: 'domcontentloaded', timeout: 15000});
    await p.waitForTimeout(3000);
    const title = await p.title();
    const h1 = await p.evaluate(() => document.querySelector('h1')?.textContent?.trim() || 'no h1');
    const links = await p.evaluate(() => document.querySelectorAll('a').length);
    const hasError = await p.evaluate(() => document.body.textContent.includes('Something went wrong'));
    console.log(`  Title: ${title}`);
    console.log(`  H1: ${h1}`);
    console.log(`  Links: ${links}`);
    console.log(`  Error page: ${hasError}`);
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}

// Also try the main search page and see what URL it navigates to
console.log('\n=== Trying main search...');
await p.goto('https://www.boattrader.com/boats/', {waitUntil: 'domcontentloaded', timeout: 15000});
await p.waitForTimeout(3000);
const finalUrl = p.url();
console.log('Final URL:', finalUrl);
const title = await p.title();
console.log('Title:', title);

// Check for search/filter links
const filterLinks = await p.evaluate(() => {
  return [...document.querySelectorAll('a[href]')].filter(a => {
    const h = a.href.toLowerCase();
    return h.includes('sportfish') || h.includes('convertible') || h.includes('class=') || h.includes('/type-');
  }).map(a => ({ href: a.href.slice(0, 120), text: a.textContent?.trim()?.slice(0, 50) })).slice(0, 15);
});
console.log('\nFilter links:', filterLinks.length);
for (const l of filterLinks) {
  console.log(`  ${l.href} → ${l.text}`);
}

await b.close();
