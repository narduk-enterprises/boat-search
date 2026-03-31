#!/usr/bin/env node
/**
 * Quick test: Can we pass Cloudflare challenge on BoatTrader/YachtWorld?
 * Waits for the challenge page to resolve before dumping structure.
 */
import { chromium } from 'playwright'

const urls = [
  'https://www.boattrader.com/boats/type-power/class-sportfish-convertible/?length=40-60&price=,1000000',
  'https://www.yachtworld.com/boats-for-sale/type-power/class-sportfish-convertible/?length=40-60&price=0-1000000&country=united-states',
]

const targetUrl = process.argv[2] || urls[0]

console.log(`🔍 Testing CF challenge bypass for: ${targetUrl}\n`)

const browser = await chromium.launch({
  headless: false, // Headed mode to see the challenge
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
  ],
})

const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1440, height: 900 },
  locale: 'en-US',
})

const page = await context.newPage()

// Override navigator.webdriver
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false })
  delete navigator.__proto__.webdriver
  // Chrome runtime
  window.chrome = { runtime: {}, loadTimes: function () {}, csi: function () {} }
  // Override permissions
  const originalQuery = window.navigator.permissions.query
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters)
})

console.log('📡 Navigating...')
await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

let title = await page.title()
console.log(`📄 Initial title: "${title}"`)

// Wait for CF challenge to complete (up to 30s)
if (title.includes('moment') || title.includes('Verif') || title.includes('challenge')) {
  console.log('⏳ Waiting for Cloudflare challenge...')
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    title = await page.title()
    console.log(`   [${(i + 1) * 2}s] title: "${title}"`)
    if (!title.includes('moment') && !title.includes('Verif') && !title.includes('challenge')) {
      console.log('✅ Challenge passed!')
      break
    }
  }
}

// Now check what we see
const analysis = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a')]
  const boatLinks = links.filter((a) => {
    const href = a.href || ''
    return href.includes('/boat') || href.includes('/listing') || href.includes('/yacht')
  })

  return {
    title: document.title,
    totalLinks: links.length,
    boatLinks: boatLinks.slice(0, 10).map((a) => ({
      href: a.href,
      text: a.textContent?.trim().slice(0, 80),
      parent: a.parentElement?.className?.slice(0, 50) || '',
    })),
    bodyText: document.body?.textContent?.trim().slice(0, 300) || '',
  }
})

console.log(`\n📊 After challenge:`)
console.log(`   Title: ${analysis.title}`)
console.log(`   Total links: ${analysis.totalLinks}`)
console.log(`   Boat links: ${analysis.boatLinks.length}`)

if (analysis.boatLinks.length > 0) {
  console.log('\n── Boat Links ──')
  for (const link of analysis.boatLinks) {
    console.log(`  ${link.href}`)
    console.log(`    text: ${link.text}`)
    console.log(`    parent class: ${link.parent}`)
  }
}

console.log(`\n── Body text (first 300 chars) ──`)
console.log(analysis.bodyText)

await page.screenshot({ path: '/tmp/boattrader-debug.png', fullPage: false })
console.log('\n📸 Screenshot saved to /tmp/boattrader-debug.png')

await browser.close()
