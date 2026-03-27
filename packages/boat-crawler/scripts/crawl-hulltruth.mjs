#!/usr/bin/env node
/**
 * Compliant The Hull Truth crawler entrypoint.
 */

import { runSource } from '../src/source-runner.mjs'

const summary = await runSource('hulltruth')
console.log(`\n✅ ${summary.sourceKey} finished with status ${summary.status}`)
console.log(`   Boats found: ${summary.boatsFound}`)
console.log(`   Boats scraped: ${summary.boatsScraped}`)
if (summary.stopReason) {
  console.log(`   Stop reason: ${summary.stopReason}`)
}
