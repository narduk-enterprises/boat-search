#!/usr/bin/env node
/**
 * Compliant boats.com crawler entrypoint.
 * Shared checkpoint, telemetry, and block handling live in `src/source-runner.mjs`.
 */

import { runSource } from '../src/source-runner.mjs'

const summary = await runSource('boats-com')
console.log(`\n✅ ${summary.sourceKey} finished with status ${summary.status}`)
console.log(`   Boats found: ${summary.boatsFound}`)
console.log(`   Boats scraped: ${summary.boatsScraped}`)
if (summary.stopReason) {
  console.log(`   Stop reason: ${summary.stopReason}`)
}
