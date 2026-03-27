#!/usr/bin/env node
/**
 * Quick shared boats.com run.
 *
 * Preserves the old quick-start script name while routing through the shared
 * source runner. By default it narrows to one search page unless MAX_PAGES is
 * explicitly set.
 */

if (!process.env.MAX_PAGES) {
  process.env.MAX_PAGES = '1'
}

import { runSource } from '../src/source-runner.mjs'

const summary = await runSource('boats-com')
console.log(`\n✅ ${summary.sourceKey} finished with status ${summary.status}`)
console.log(`   Boats found: ${summary.boatsFound}`)
console.log(`   Boats scraped: ${summary.boatsScraped}`)
if (summary.stopReason) {
  console.log(`   Stop reason: ${summary.stopReason}`)
}
