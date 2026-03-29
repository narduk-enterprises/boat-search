import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { BoatDedupeRecord } from '../apps/web/lib/boatDedupe'
import { deriveBoatDedupeState } from '../apps/web/lib/boatDedupe'

const __dirname = dirname(fileURLToPath(import.meta.url))

const D1_DATABASE = 'boat-search-db'
const WRANGLER_DIR = resolve(__dirname, '../apps/web')
const SQL_BATCH_SIZE = 25

type RebuildOptions = {
  isProduction?: boolean
  databaseName?: string
  wranglerDir?: string
}

type D1JsonRow = {
  results: Record<string, unknown>[]
  success: boolean
}

function esc(value: string | number | null) {
  if (value == null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function resolveLocalFlag(isProduction: boolean) {
  return isProduction ? '--remote' : '--local'
}

function runD1Json(sql: string, options: Required<RebuildOptions>) {
  const output = execSync(
    `wrangler d1 execute ${options.databaseName} ${resolveLocalFlag(options.isProduction)} --command "${sql.replace(/"/g, '\\"')}" --json`,
    {
      cwd: options.wranglerDir,
      stdio: 'pipe',
      encoding: 'utf8',
    },
  )

  const parsed = JSON.parse(output) as D1JsonRow[]
  return parsed[0]?.results ?? []
}

function runD1Sql(sql: string, options: Required<RebuildOptions>) {
  execSync(
    `wrangler d1 execute ${options.databaseName} ${resolveLocalFlag(options.isProduction)} --command "${sql.replace(/"/g, '\\"')}"`,
    {
      cwd: options.wranglerDir,
      stdio: 'pipe',
    },
  )
}

function chunkStatements(statements: string[]) {
  const chunks: string[][] = []
  for (let index = 0; index < statements.length; index += SQL_BATCH_SIZE) {
    chunks.push(statements.slice(index, index + SQL_BATCH_SIZE))
  }
  return chunks
}

function mapBoatRow(row: Record<string, unknown>): BoatDedupeRecord {
  let images: string[] = []
  if (row.images != null) {
    try {
      const parsed = JSON.parse(String(row.images)) as unknown
      if (Array.isArray(parsed)) {
        images = parsed.filter((value): value is string => typeof value === 'string')
      }
    } catch {
      images = []
    }
  }

  return {
    id: Number(row.id),
    source: String(row.source ?? 'boats.com'),
    url: String(row.url ?? ''),
    listingId: row.listing_id != null ? String(row.listing_id) : null,
    make: row.make != null ? String(row.make) : null,
    model: row.model != null ? String(row.model) : null,
    year: row.year != null ? Number(row.year) : null,
    length: row.length != null ? String(row.length) : null,
    price: row.price != null ? String(row.price) : null,
    location: row.location != null ? String(row.location) : null,
    city: row.city != null ? String(row.city) : null,
    state: row.state != null ? String(row.state) : null,
    country: row.country != null ? String(row.country) : null,
    contactInfo: row.contact_info != null ? String(row.contact_info) : null,
    contactName: row.contact_name != null ? String(row.contact_name) : null,
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : null,
    description: row.description != null ? String(row.description) : null,
    fullText: row.full_text != null ? String(row.full_text) : null,
    images,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }
}

export function resolveRebuildOptions(options: RebuildOptions = {}): Required<RebuildOptions> {
  return {
    isProduction: options.isProduction ?? false,
    databaseName: options.databaseName ?? D1_DATABASE,
    wranglerDir: options.wranglerDir ?? WRANGLER_DIR,
  }
}

export function rebuildBoatDedupeInD1(input: RebuildOptions = {}) {
  const options = resolveRebuildOptions(input)
  const rows = runD1Json(
    `
      SELECT
        id,
        source,
        url,
        listing_id,
        make,
        model,
        year,
        length,
        price,
        location,
        city,
        state,
        country,
        contact_info,
        contact_name,
        contact_phone,
        description,
        full_text,
        images,
        updated_at
      FROM boats
      ORDER BY id ASC;
    `,
    options,
  )

  const result = deriveBoatDedupeState(rows.map(mapBoatRow))
  runD1Sql(
    `
      DELETE FROM boat_dedupe_candidates;
      DELETE FROM boat_entities;
      UPDATE boats
      SET
        entity_id = NULL,
        superseded_by_boat_id = NULL,
        dedupe_method = NULL,
        dedupe_confidence = NULL;
    `,
    options,
  )

  const now = new Date().toISOString()
  const entityStatements = result.entities.map(
    (entity) =>
      `INSERT INTO boat_entities (representative_boat_id, created_at, updated_at) VALUES (${esc(entity.representativeBoatId)}, ${esc(now)}, ${esc(now)});`,
  )
  for (const chunk of chunkStatements(entityStatements)) {
    if (chunk.length === 0) continue
    runD1Sql(chunk.join('\n'), options)
  }

  const entityRows = runD1Json(
    `
      SELECT id, representative_boat_id
      FROM boat_entities;
    `,
    options,
  )
  const entityIdByRepresentativeBoatId = new Map<number, number>()
  for (const row of entityRows) {
    entityIdByRepresentativeBoatId.set(Number(row.representative_boat_id), Number(row.id))
  }

  const assignmentStatements = result.assignments.map((assignment) => {
    const entityId =
      assignment.entityKey != null
        ? (entityIdByRepresentativeBoatId.get(assignment.entityKey) ?? null)
        : null
    return `
      UPDATE boats
      SET
        entity_id = ${esc(entityId)},
        superseded_by_boat_id = ${esc(assignment.supersededByBoatId)},
        dedupe_method = ${esc(assignment.dedupeMethod)},
        dedupe_confidence = ${esc(assignment.dedupeConfidence)}
      WHERE id = ${assignment.boatId};
    `
  })
  for (const chunk of chunkStatements(assignmentStatements)) {
    if (chunk.length === 0) continue
    runD1Sql(chunk.join('\n'), options)
  }

  const candidateStatements = result.candidates.map(
    (candidate) => `
      INSERT INTO boat_dedupe_candidates (
        left_boat_id,
        right_boat_id,
        confidence_score,
        rule_hits_json,
        created_at,
        updated_at
      ) VALUES (
        ${candidate.leftBoatId},
        ${candidate.rightBoatId},
        ${candidate.confidenceScore},
        ${esc(JSON.stringify(candidate.ruleHits))},
        ${esc(now)},
        ${esc(now)}
      );
    `,
  )
  for (const chunk of chunkStatements(candidateStatements)) {
    if (chunk.length === 0) continue
    runD1Sql(chunk.join('\n'), options)
  }

  return result
}

function main() {
  const args = process.argv.slice(2)
  const isProduction = args.includes('--production')
  const result = rebuildBoatDedupeInD1({ isProduction })

  console.log('🔁 Boat dedupe rebuild complete')
  console.log(`   Entities:   ${result.entities.length}`)
  console.log(`   Candidates: ${result.candidates.length}`)
  console.log(
    `   Superseded: ${result.assignments.filter((assignment) => assignment.supersededByBoatId != null).length}`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
