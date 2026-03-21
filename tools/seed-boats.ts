/**
 * Seed boats from local SQLite database (boats.db) into D1 via wrangler.
 *
 * Usage:
 *   pnpm tsx tools/seed-boats.ts [--db path/to/boats.db] [--production]
 *
 * By default reads from ../boat-finder/data/boats.db (sibling repo).
 * Uses `wrangler d1 execute` to run INSERT statements against D1.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2)
const isProduction = args.includes('--production')
const dbArgIdx = args.indexOf('--db')
const dbPath =
  dbArgIdx !== -1 && args[dbArgIdx + 1]
    ? resolve(args[dbArgIdx + 1])
    : resolve(__dirname, '../../boat-finder/data/boats.db')

const D1_DATABASE = 'boat-search-db'
const WRANGLER_DIR = resolve(__dirname, '../apps/web')
const BATCH_SIZE = 20

console.log('🚤 Seeding boats into D1...')
console.log(`   Source SQLite: ${dbPath}`)
console.log(`   Target D1:     ${D1_DATABASE}`)
console.log(`   Environment:   ${isProduction ? 'PRODUCTION' : 'LOCAL'}`)

if (!existsSync(dbPath)) {
  console.error(`\n❌ SQLite database not found at: ${dbPath}`)
  console.error('   Run the crawler first, or pass --db /path/to/boats.db')
  process.exit(1)
}

// ── Read from SQLite ────────────────────────────────────────
const db = new Database(dbPath, { readonly: true })
const rows = db
  .prepare(
    `
  SELECT
    listing_id, source, url, make, model, year, length, price, currency,
    location, city, state, country, description, seller_type, listing_type,
    images, full_text, scraped_at, updated_at,
    search_length_min, search_length_max, search_type, search_location
  FROM boats
  ORDER BY CAST(price AS INTEGER) DESC
`,
  )
  .all() as Record<string, unknown>[]
db.close()

console.log(`\n📊 Found ${rows.length} boats in SQLite\n`)

if (rows.length === 0) {
  console.log('   Nothing to seed.')
  process.exit(0)
}

// ── Escape SQL string ───────────────────────────────────────
function esc(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  const str = String(value).replace(/'/g, "''")
  return `'${str}'`
}

// ── Build INSERT statements in batches ──────────────────────
const columns = [
  'listing_id',
  'source',
  'url',
  'make',
  'model',
  'year',
  'length',
  'price',
  'currency',
  'location',
  'city',
  'state',
  'country',
  'description',
  'seller_type',
  'listing_type',
  'images',
  'full_text',
  'scraped_at',
  'updated_at',
  'search_length_min',
  'search_length_max',
  'search_type',
  'search_location',
]

let inserted = 0

// Clear existing data to prevent duplicate accumulation across seed runs
const localFlag = isProduction ? '--remote' : '--local'
console.log('🗑️  Clearing existing boats from D1...')
try {
  execSync(
    `wrangler d1 execute ${D1_DATABASE} ${localFlag} --command "DELETE FROM boats;"`,
    { cwd: WRANGLER_DIR, stdio: 'pipe' },
  )
  console.log('   ✅ Table cleared\n')
} catch (error) {
  console.error('   ⚠️ Could not clear table:', (error as Error).message)
}

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE)
  const statements: string[] = []

  for (const row of batch) {
    const values = columns.map((col) => {
      const val = row[col]
      if (val === null || val === undefined) return 'NULL'
      if (typeof val === 'number') return String(val)
      return esc(val)
    })

    statements.push(
      `INSERT OR REPLACE INTO boats (${columns.join(', ')}) VALUES (${values.join(', ')});`,
    )
  }

  const sql = statements.join('\n')

  try {
    execSync(
      `wrangler d1 execute ${D1_DATABASE} ${localFlag} --command "${sql.replace(/"/g, '\\"')}"`,
      { cwd: WRANGLER_DIR, stdio: 'pipe' },
    )
    inserted += batch.length
    process.stdout.write(`   Inserted ${inserted}/${rows.length}\r`)
  } catch (error) {
    console.error(`\n❌ Failed at batch starting row ${i}:`, (error as Error).message)
    // Continue with next batch
  }
}

console.log(`\n\n✅ Seeding complete! ${inserted}/${rows.length} boats inserted into D1.`)
