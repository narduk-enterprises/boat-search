import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const D1_DATABASE = 'boat-search-db'
const WRANGLER_DIR = resolve(__dirname, '../apps/web')
const DEFAULT_OUTPUT = resolve(WRANGLER_DIR, 'drizzle/seed-inventory-sample.sql')

const TOP_STATE_LIMIT = 8
const MATCHED_PER_STATE = 6
const FAILED_PER_STATE = 3
const UNKNOWN_PER_STATE = 2
const GENERIC_STATE_LIMIT = 12
const BOATS_DOT_COM_LIMIT = 12
const HIGHEST_PRICE_LIMIT = 12
const LOWEST_PRICE_LIMIT = 12
const FETCH_BATCH_SIZE = 20
const DEFAULT_TEXT_LIMIT = 1200

const JSON_ARRAY_LIMITS = new Map([
  ['images', 6],
  ['source_images', 8],
])

const TEXT_LIMITS = new Map([
  ['description', 1800],
  ['full_text', 1800],
  ['other_details', 1200],
  ['disclaimer', 800],
  ['features', 1000],
  ['electrical_equipment', 700],
  ['electronics', 700],
  ['inside_equipment', 700],
  ['outside_equipment', 700],
  ['additional_equipment', 700],
  ['propulsion', 900],
  ['specifications', 1000],
  ['contact_info', 400],
])

type D1QueryEnvelope = {
  results: Array<Record<string, unknown>>
  success: boolean
}

type BoatRow = Record<string, string | number | boolean | null>

const args = process.argv.slice(2)
const outArgIndex = args.indexOf('--out')
const outputPath =
  outArgIndex !== -1 && args[outArgIndex + 1]
    ? resolve(process.cwd(), args[outArgIndex + 1])
    : DEFAULT_OUTPUT

function resolveWranglerInvocation() {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) {
    return {
      command: 'wrangler',
      argsPrefix: ['d1', 'execute', D1_DATABASE, '--remote'],
    }
  }

  return {
    command: 'doppler',
    argsPrefix: ['run', '--config', 'prd', '--', 'wrangler', 'd1', 'execute', D1_DATABASE, '--remote'],
  }
}

function runRemoteQuery(sql: string) {
  const invocation = resolveWranglerInvocation()
  const output = execFileSync(
    invocation.command,
    [...invocation.argsPrefix, '--command', sql, '--json'],
    {
      cwd: WRANGLER_DIR,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: 'pipe',
    },
  )

  const parsed = JSON.parse(output) as D1QueryEnvelope[]
  return parsed[0]?.results ?? []
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlValue(value: unknown): string {
  if (value == null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return sqlString(String(value))
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit).trimEnd()}…`
}

function normalizeSeedValue(column: string, value: string | number | boolean | null) {
  if (typeof value !== 'string') return value

  const arrayLimit = JSON_ARRAY_LIMITS.get(column)
  if (arrayLimit) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) {
        return JSON.stringify(
          parsed.filter((item): item is string => typeof item === 'string').slice(0, arrayLimit),
        )
      }
    } catch {
      return truncateText(value, DEFAULT_TEXT_LIMIT)
    }
  }

  const textLimit = TEXT_LIMITS.get(column) ?? DEFAULT_TEXT_LIMIT
  return truncateText(value, textLimit)
}

function parseNumericId(row: Record<string, unknown>) {
  const value = row.id
  return typeof value === 'number' ? value : Number(value)
}

function selectIds(sql: string) {
  return runRemoteQuery(sql)
    .map(parseNumericId)
    .filter((value) => Number.isInteger(value))
}

function addIds(target: number[], seen: Set<number>, ids: number[]) {
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    target.push(id)
  }
}

function fetchBoatRows(ids: number[]) {
  const byId = new Map<number, BoatRow>()

  for (let index = 0; index < ids.length; index += FETCH_BATCH_SIZE) {
    const chunk = ids.slice(index, index + FETCH_BATCH_SIZE)
    if (!chunk.length) continue

    const rows = runRemoteQuery(`
      SELECT *
      FROM boats
      WHERE id IN (${chunk.join(', ')})
      ORDER BY id ASC;
    `)

    for (const row of rows) {
      const id = parseNumericId(row)
      byId.set(id, row as BoatRow)
    }
  }

  return ids.map((id) => byId.get(id)).filter((row): row is BoatRow => row != null)
}

function buildInsertStatements(rows: BoatRow[]) {
  const columns = Object.keys(rows[0] ?? {})
  const quotedColumns = columns.join(', ')

  return rows.map((row) => {
    const values = columns.map((column) => sqlValue(normalizeSeedValue(column, row[column] ?? null)))
    return `INSERT OR REPLACE INTO boats (${quotedColumns}) VALUES (${values.join(', ')});`
  })
}

function summarizeSelection(rows: BoatRow[]) {
  const sourceCounts = new Map<string, number>()
  const geoCounts = new Map<string, number>()
  const stateCounts = new Map<string, number>()

  for (const row of rows) {
    const source = String(row.source ?? 'unknown')
    const geoStatus = row.geo_status == null ? 'null' : String(row.geo_status)
    const state = String(row.state ?? 'UNKNOWN')

    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    geoCounts.set(geoStatus, (geoCounts.get(geoStatus) ?? 0) + 1)
    stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1)
  }

  return {
    sourceCounts: [...sourceCounts.entries()].sort((left, right) => right[1] - left[1]),
    geoCounts: [...geoCounts.entries()].sort((left, right) => right[1] - left[1]),
    stateCounts: [...stateCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12),
  }
}

const topStates = runRemoteQuery(`
  SELECT state
  FROM boats
  WHERE state IS NOT NULL
    AND TRIM(state) != ''
    AND state != 'United States'
  GROUP BY state
  ORDER BY COUNT(*) DESC, state ASC
  LIMIT ${TOP_STATE_LIMIT};
`).map((row) => String(row.state))

const selectedBoatIds: number[] = []
const seenBoatIds = new Set<number>()

for (const state of topStates) {
  addIds(
    selectedBoatIds,
    seenBoatIds,
    selectIds(`
      SELECT id
      FROM boats
      WHERE state = ${sqlString(state)}
        AND geo_status = 'matched'
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ${MATCHED_PER_STATE};
    `),
  )

  addIds(
    selectedBoatIds,
    seenBoatIds,
    selectIds(`
      SELECT id
      FROM boats
      WHERE state = ${sqlString(state)}
        AND geo_status = 'failed'
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ${FAILED_PER_STATE};
    `),
  )

  addIds(
    selectedBoatIds,
    seenBoatIds,
    selectIds(`
      SELECT id
      FROM boats
      WHERE state = ${sqlString(state)}
        AND geo_status IS NULL
      ORDER BY datetime(updated_at) DESC, id DESC
      LIMIT ${UNKNOWN_PER_STATE};
    `),
  )
}

addIds(
  selectedBoatIds,
  seenBoatIds,
  selectIds(`
    SELECT id
    FROM boats
    WHERE LOWER(source) = 'boats.com'
    ORDER BY CASE WHEN geo_status = 'matched' THEN 0 ELSE 1 END, datetime(updated_at) DESC, id DESC
    LIMIT ${BOATS_DOT_COM_LIMIT};
  `),
)

addIds(
  selectedBoatIds,
  seenBoatIds,
  selectIds(`
    SELECT id
    FROM boats
    WHERE state IS NULL OR TRIM(state) = '' OR state = 'United States'
    ORDER BY CASE WHEN geo_status = 'matched' THEN 0 ELSE 1 END, datetime(updated_at) DESC, id DESC
    LIMIT ${GENERIC_STATE_LIMIT};
  `),
)

addIds(
  selectedBoatIds,
  seenBoatIds,
  selectIds(`
    SELECT id
    FROM boats
    WHERE price GLOB '[0-9]*'
    ORDER BY CAST(price AS INTEGER) DESC, datetime(updated_at) DESC, id DESC
    LIMIT ${HIGHEST_PRICE_LIMIT};
  `),
)

addIds(
  selectedBoatIds,
  seenBoatIds,
  selectIds(`
    SELECT id
    FROM boats
    WHERE price GLOB '[0-9]*'
    ORDER BY CAST(price AS INTEGER) ASC, datetime(updated_at) DESC, id DESC
    LIMIT ${LOWEST_PRICE_LIMIT};
  `),
)

const selectedRows = fetchBoatRows(selectedBoatIds)

if (!selectedRows.length) {
  throw new Error('Representative seed refresh returned zero boats.')
}

const statements = buildInsertStatements(selectedRows)
const summary = summarizeSelection(selectedRows)
const fileContents = [
  '-- Representative production inventory seed for local D1 development.',
  '-- Generated by tools/refresh-representative-boat-seed.ts.',
  `-- Generated at: ${new Date().toISOString()}`,
  `-- Top states: ${topStates.join(', ')}`,
  `-- Boat count: ${selectedRows.length}`,
  'DELETE FROM boats;',
  ...statements,
  '',
].join('\n')

writeFileSync(outputPath, fileContents, 'utf8')

console.log(`Wrote representative inventory seed to ${outputPath}`)
console.log(`Selected ${selectedRows.length} boats`)
console.log('Source mix:', summary.sourceCounts)
console.log('Geo mix:', summary.geoCounts)
console.log('Top states in sample:', summary.stateCounts)
