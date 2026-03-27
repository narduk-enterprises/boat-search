#!/usr/bin/env node
/**
 * Run all compliant crawler sources sequentially.
 */

import { runAllSources } from '../src/orchestrator.mjs'

const summaries = await runAllSources()

console.log('\n═══════════════════════════════════════════════')
console.log('  Crawl Summary')
console.log('═══════════════════════════════════════════════')
for (const summary of summaries) {
  console.log(`- ${summary.sourceKey}: ${summary.status}`)
  if (summary.boatsFound != null) {
    console.log(`  found=${summary.boatsFound} scraped=${summary.boatsScraped}`)
  }
  if (summary.stopReason) {
    console.log(`  reason=${summary.stopReason}`)
  }
}
