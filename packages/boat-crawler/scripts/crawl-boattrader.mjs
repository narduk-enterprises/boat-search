#!/usr/bin/env node
/**
 * Compliant BoatTrader crawler entrypoint.
 */

import { runSource } from '../src/source-runner.mjs'

const summary = await runSource('boattrader')
console.log(`\n✅ ${summary.sourceKey} finished with status ${summary.status}`)
console.log(`   Boats found: ${summary.boatsFound}`)
console.log(`   Boats scraped: ${summary.boatsScraped}`)
if (summary.stopReason) {
  console.log(`   Stop reason: ${summary.stopReason}`)
}
