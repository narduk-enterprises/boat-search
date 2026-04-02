#!/usr/bin/env tsx
/**
 * Reprocess R2 Detail Artifacts — Backfill D1 with __REDUX_STATE__ Data
 *
 * Downloads each R2 detail-page artifact, parses the embedded __REDUX_STATE__,
 * and updates D1 boat rows with richer structured data + full-resolution images.
 *
 * Usage:
 *   pnpm exec tsx scripts/yachtworld/reprocessR2Artifacts.ts --dry-run
 *   pnpm exec tsx scripts/yachtworld/reprocessR2Artifacts.ts
 *   pnpm exec tsx scripts/yachtworld/reprocessR2Artifacts.ts --batch-size=25
 *   pnpm exec tsx scripts/yachtworld/reprocessR2Artifacts.ts --limit=5
 */

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractBoatDataFromHtml,
  buildBoatUpdatePatch,
  camelToSnake,
} from '../../lib/reduxExtractor'

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH_SIZE = Number(args.find((a) => a.startsWith('--batch-size='))?.split('=')[1]) || 50
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1]) || 0
const VERBOSE = args.includes('--verbose')

const CWD = join(import.meta.dirname, '../..')
const DB_NAME = 'boat-search-db'
const BUCKET_NAME = 'boat-search-images'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrangler(cmd: string): string {
  return execSync(`npx wrangler ${cmd}`, {
    cwd: CWD,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

function d1Query(sql: string): Record<string, unknown>[] {
  const raw = wrangler(`d1 execute ${DB_NAME} --remote --json --command "${sql.replace(/"/g, '\\"')}"`)
  try {
    const parsed = JSON.parse(raw)
    // wrangler d1 --json returns an array of result objects
    if (Array.isArray(parsed) && parsed.length > 0) {
      return (parsed[0].results ?? []) as Record<string, unknown>[]
    }
    return []
  } catch {
    console.error('Failed to parse D1 JSON response:', raw.slice(0, 500))
    return []
  }
}

function downloadR2Object(key: string, destPath: string): boolean {
  try {
    wrangler(`r2 object get "${BUCKET_NAME}/${key}" --remote --file "${destPath}"`)
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

const stats = {
  total: 0,
  processed: 0,
  skippedNoRedux: 0,
  skippedDownloadFailed: 0,
  updated: 0,
  noChanges: 0,
  errors: 0,
  fieldCounts: {} as Record<string, number>,
  imagesUpgraded: 0,
  coordsAdded: 0,
}

function trackField(field: string) {
  stats.fieldCounts[field] = (stats.fieldCounts[field] ?? 0) + 1
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  R2 Detail Artifact → D1 Backfill                          ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`  Mode:       ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '🔥 LIVE'}`)
  console.log(`  Batch size: ${BATCH_SIZE}`)
  console.log(`  Limit:      ${LIMIT || 'all'}`)
  console.log()

  // Step 1: Query all artifact listings from D1
  console.log('📋 Querying crawl_job_listings for artifact keys...')
  const listingsSql = `
    SELECT
      cjl.persisted_boat_id as boatId,
      cjl.listing_id as listingId,
      json_extract(cjl.audit_json, '$.detailArtifactLatestKey') as artifactKey
    FROM crawl_job_listings cjl
    JOIN boats b ON b.id = cjl.persisted_boat_id
    WHERE json_extract(cjl.audit_json, '$.detailArtifactLatestKey') IS NOT NULL
      AND json_extract(cjl.audit_json, '$.detailArtifactLatestKey') != 'null'
      AND b.superseded_by_boat_id IS NULL
    ORDER BY cjl.persisted_boat_id DESC
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

  const listings = d1Query(listingsSql)
  stats.total = listings.length
  console.log(`   Found ${stats.total} artifact listings.\n`)

  if (stats.total === 0) {
    console.log('✅ Nothing to process.')
    return
  }

  // Step 2: Process in batches
  const batches: typeof listings[] = []
  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    batches.push(listings.slice(i, i + BATCH_SIZE))
  }

  console.log(`📦 Processing ${batches.length} batches of up to ${BATCH_SIZE}...\n`)

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!
    console.log(`── Batch ${batchIdx + 1}/${batches.length} (${batch.length} items) ──`)

    // Fetch existing boat data for this batch
    const boatIds = batch.map((l) => l.boatId).join(',')
    const existingBoatsSql = `
      SELECT * FROM boats WHERE id IN (${boatIds})
    `.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    const existingBoats = d1Query(existingBoatsSql)
    const boatMap = new Map(existingBoats.map((b) => [b.id, b]))

    for (const listing of batch) {
      const boatId = listing.boatId as number
      const artifactKey = listing.artifactKey as string
      const listingId = listing.listingId as string
      stats.processed++

      if (VERBOSE) {
        console.log(`   [${stats.processed}/${stats.total}] Boat #${boatId} (listing ${listingId})`)
      }

      // Download artifact from R2
      const tmpFile = `/tmp/r2-artifact-${boatId}.json`
      const downloaded = downloadR2Object(artifactKey, tmpFile)
      if (!downloaded) {
        console.log(`   ⚠️  Failed to download: ${artifactKey}`)
        stats.skippedDownloadFailed++
        continue
      }

      try {
        // Parse artifact JSON
        const artifactJson = readFileSync(tmpFile, 'utf-8')
        const artifact = JSON.parse(artifactJson) as {
          pages?: Array<{ html?: string; role?: string }>
        }
        const detailPage = artifact.pages?.find((p) => p.role === 'detail')
        const html = detailPage?.html
        if (!html) {
          if (VERBOSE) console.log(`   ⚠️  No detail HTML in artifact`)
          stats.skippedNoRedux++
          continue
        }

        // Extract Redux data
        const extracted = extractBoatDataFromHtml(html)
        if (!extracted) {
          if (VERBOSE) console.log(`   ⚠️  No __REDUX_STATE__ found in HTML`)
          stats.skippedNoRedux++
          continue
        }

        // Get existing boat row
        const existingBoat = boatMap.get(boatId)
        if (!existingBoat) {
          if (VERBOSE) console.log(`   ⚠️  Boat #${boatId} not found in D1`)
          stats.errors++
          continue
        }

        // Build update patch
        const patch = buildBoatUpdatePatch(existingBoat, extracted)
        const patchKeys = Object.keys(patch)

        if (patchKeys.length === 0) {
          if (VERBOSE) console.log(`   ✓  No changes needed`)
          stats.noChanges++
          continue
        }

        // Track stats
        for (const key of patchKeys) {
          trackField(key)
        }
        if (patch.images) stats.imagesUpgraded++
        if (patch.geoLat != null) stats.coordsAdded++

        if (DRY_RUN) {
          console.log(
            `   🔍 Would update boat #${boatId}: ${patchKeys.map((k) => camelToSnake(k)).join(', ')}`,
          )
          stats.updated++
          continue
        }

        // Build and execute UPDATE
        const setClauses: string[] = []
        const values: unknown[] = []
        for (const [key, value] of Object.entries(patch)) {
          setClauses.push(`${camelToSnake(key)} = '${String(value).replace(/'/g, "''")}'`)
        }
        setClauses.push(`updated_at = '${new Date().toISOString()}'`)

        const updateSql = `UPDATE boats SET ${setClauses.join(', ')} WHERE id = ${boatId}`

        try {
          d1Query(updateSql)
          stats.updated++
          if (VERBOSE) {
            console.log(
              `   ✅ Updated boat #${boatId}: ${patchKeys.length} fields`,
            )
          }
        } catch (error) {
          console.error(`   ❌ Failed to update boat #${boatId}:`, error)
          stats.errors++
        }
      } catch (error) {
        console.error(`   ❌ Error processing boat #${boatId}:`, error)
        stats.errors++
      } finally {
        // Cleanup temp file
        if (existsSync(tmpFile)) {
          try {
            unlinkSync(tmpFile)
          } catch {
            // ignore cleanup errors
          }
        }
      }
    }

    console.log(`   Batch ${batchIdx + 1} complete. Progress: ${stats.processed}/${stats.total}\n`)
  }

  // Print summary
  console.log()
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Summary                                                    ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`  Total artifacts:      ${stats.total}`)
  console.log(`  Processed:            ${stats.processed}`)
  console.log(`  Updated:              ${stats.updated}`)
  console.log(`  No changes needed:    ${stats.noChanges}`)
  console.log(`  Download failed:      ${stats.skippedDownloadFailed}`)
  console.log(`  No Redux data:        ${stats.skippedNoRedux}`)
  console.log(`  Errors:               ${stats.errors}`)
  console.log(`  Images upgraded:      ${stats.imagesUpgraded}`)
  console.log(`  Coordinates added:    ${stats.coordsAdded}`)
  console.log()

  if (Object.keys(stats.fieldCounts).length > 0) {
    console.log('  Fields updated:')
    const sorted = Object.entries(stats.fieldCounts).sort(([, a], [, b]) => b - a)
    for (const [field, count] of sorted) {
      console.log(`    ${camelToSnake(field).padEnd(30)} ${count}`)
    }
  }

  console.log()
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes were written.' : '✅ Backfill complete!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
