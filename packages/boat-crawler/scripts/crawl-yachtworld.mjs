#!/usr/bin/env node
/**
 * Compliant YachtWorld crawler entrypoint.
 * Stops the source when challenge/interstitial/parser drift is detected.
 */

import { runSource } from '../src/source-runner.mjs'

const summary = await runSource('yachtworld')
console.log(`\n✅ ${summary.sourceKey} finished with status ${summary.status}`)
console.log(`   Boats found: ${summary.boatsFound}`)
console.log(`   Boats scraped: ${summary.boatsScraped}`)
if (summary.stopReason) {
  console.log(`   Stop reason: ${summary.stopReason}`)
}
