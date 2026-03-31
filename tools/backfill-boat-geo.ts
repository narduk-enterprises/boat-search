import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { geocodeAppleMaps } from '../layers/narduk-nuxt-layer/server/utils/appleMapToken'
import {
  BOAT_GEO_NORMALIZATION_VERSION,
  BOAT_GEO_PRECISION,
  BOAT_GEO_PROVIDER,
  BOAT_GEO_STATUSES,
  normalizeBoatGeo,
  resolveAppleGeocodeMatch,
  type AppleGeocodeCandidate,
  type BoatGeoStatus,
} from '../apps/web/lib/boatGeo'

const __dirname = dirname(fileURLToPath(import.meta.url))

const D1_DATABASE = 'boat-search-db'
const WRANGLER_DIR = resolve(__dirname, '../apps/web')
const DEFAULT_LIMIT = 250
const DEFAULT_BATCH_SIZE = 25

type BackfillOptions = {
  isProduction: boolean
  databaseName: string
  wranglerDir: string
  dryRun: boolean
  limit: number
  batchSize: number
  resumeAfterId: number
  statuses: BoatGeoStatus[]
}

type D1JsonEnvelope = {
  results: Record<string, unknown>[]
  success: boolean
}

type BoatGeoRow = {
  id: number
  location: string | null
  city: string | null
  state: string | null
  country: string | null
}

type CachedGeocodeRow = {
  status: string
  lat: number | null
  lng: number | null
  error: string | null
}
;(
  globalThis as typeof globalThis & {
    useRuntimeConfig?: () => {
      mapkitServerApiKey: string
      appleSecretKey: string
      appleTeamId: string
      appleKeyId: string
    }
  }
).useRuntimeConfig = () => ({
  mapkitServerApiKey: process.env.MAPKIT_SERVER_API_KEY?.trim() || '',
  appleSecretKey:
    process.env.APPLE_PRIVATE_KEY?.trim() || process.env.APPLE_SECRET_KEY?.trim() || '',
  appleTeamId: process.env.APPLE_TEAM_ID?.trim() || process.env.APPLE_DEVELOPER_ID?.trim() || '',
  appleKeyId: process.env.APPLE_KEY_ID?.trim() || '',
})

function esc(value: string | number | null) {
  if (value == null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  return `'${value.replaceAll("'", "''")}'`
}

function resolveLocalFlag(isProduction: boolean) {
  return isProduction ? '--remote' : '--local'
}

function runD1Json(sql: string, options: BackfillOptions) {
  const output = execSync(
    `wrangler d1 execute ${options.databaseName} ${resolveLocalFlag(options.isProduction)} --command "${sql.replace(/"/g, '\\"')}" --json`,
    {
      cwd: options.wranglerDir,
      stdio: 'pipe',
      encoding: 'utf8',
    },
  )

  const parsed = JSON.parse(output) as D1JsonEnvelope[]
  return parsed[0]?.results ?? []
}

function runD1Sql(sql: string, options: BackfillOptions) {
  execSync(
    `wrangler d1 execute ${options.databaseName} ${resolveLocalFlag(options.isProduction)} --command "${sql.replace(/"/g, '\\"')}"`,
    {
      cwd: options.wranglerDir,
      stdio: 'pipe',
    },
  )
}

function parseArgs(args: string[]): BackfillOptions {
  let isProduction = false
  let dryRun = false
  let limit = DEFAULT_LIMIT
  let batchSize = DEFAULT_BATCH_SIZE
  let resumeAfterId = 0
  const statuses: BoatGeoStatus[] = []

  for (const arg of args) {
    if (arg === '--production') {
      isProduction = true
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg.startsWith('--limit=')) {
      limit = Number.parseInt(arg.slice('--limit='.length), 10) || DEFAULT_LIMIT
      continue
    }
    if (arg.startsWith('--batch-size=')) {
      batchSize = Number.parseInt(arg.slice('--batch-size='.length), 10) || DEFAULT_BATCH_SIZE
      continue
    }
    if (arg.startsWith('--resume-after-id=')) {
      resumeAfterId = Number.parseInt(arg.slice('--resume-after-id='.length), 10) || 0
      continue
    }
    if (arg.startsWith('--status=')) {
      const values = arg
        .slice('--status='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is BoatGeoStatus =>
          BOAT_GEO_STATUSES.includes(value as BoatGeoStatus),
        )
      statuses.push(...values)
    }
  }

  return {
    isProduction,
    databaseName: D1_DATABASE,
    wranglerDir: WRANGLER_DIR,
    dryRun,
    limit,
    batchSize,
    resumeAfterId,
    statuses: [...new Set(statuses)],
  }
}

function buildRowFilter(options: BackfillOptions) {
  if (options.statuses.length > 0) {
    const inClause = options.statuses.map((status) => esc(status)).join(', ')
    return `geo_status IN (${inClause})`
  }

  return [
    'geo_status IS NULL',
    `geo_status = ${esc('pending')}`,
    `geo_normalization_version IS NULL`,
    `geo_normalization_version != ${BOAT_GEO_NORMALIZATION_VERSION}`,
  ].join(' OR ')
}

function loadTargetRows(options: BackfillOptions): BoatGeoRow[] {
  const rows = runD1Json(
    `
      SELECT
        id,
        location,
        city,
        state,
        country
      FROM boats
      WHERE
        superseded_by_boat_id IS NULL
        AND id > ${options.resumeAfterId}
        AND (${buildRowFilter(options)})
      ORDER BY id ASC
      LIMIT ${options.limit};
    `,
    options,
  )

  return rows.map((row) => ({
    id: Number(row.id),
    location: row.location != null ? String(row.location) : null,
    city: row.city != null ? String(row.city) : null,
    state: row.state != null ? String(row.state) : null,
    country: row.country != null ? String(row.country) : null,
  }))
}

function readCachedGeocode(query: string, options: BackfillOptions): CachedGeocodeRow | null {
  const rows = runD1Json(
    `
      SELECT status, lat, lng, error
      FROM geocode_cache
      WHERE query = ${esc(query)}
      LIMIT 1;
    `,
    options,
  )

  const row = rows[0]
  if (!row) return null

  return {
    status: String(row.status ?? 'failed'),
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    error: row.error != null ? String(row.error) : null,
  }
}

function writeCachedGeocode(
  query: string,
  now: string,
  result: CachedGeocodeRow,
  options: BackfillOptions,
) {
  if (options.dryRun) return

  runD1Sql(
    `
      INSERT INTO geocode_cache (
        query,
        provider,
        precision,
        status,
        lat,
        lng,
        error,
        created_at,
        updated_at
      ) VALUES (
        ${esc(query)},
        ${esc(BOAT_GEO_PROVIDER)},
        ${esc(BOAT_GEO_PRECISION)},
        ${esc(result.status)},
        ${esc(result.lat)},
        ${esc(result.lng)},
        ${esc(result.error)},
        ${esc(now)},
        ${esc(now)}
      )
      ON CONFLICT(query) DO UPDATE SET
        provider = excluded.provider,
        precision = excluded.precision,
        status = excluded.status,
        lat = excluded.lat,
        lng = excluded.lng,
        error = excluded.error,
        updated_at = excluded.updated_at;
    `,
    options,
  )
}

function buildBoatUpdateSql(
  boatId: number,
  now: string,
  payload: {
    normalizedLocation: string | null
    normalizedCity: string | null
    normalizedState: string | null
    normalizedCountry: string | null
    geoStatus: string
    geoQuery: string | null
    geoError: string | null
    geoLat: number | null
    geoLng: number | null
  },
) {
  return `
    UPDATE boats
    SET
      normalized_location = ${esc(payload.normalizedLocation)},
      normalized_city = ${esc(payload.normalizedCity)},
      normalized_state = ${esc(payload.normalizedState)},
      normalized_country = ${esc(payload.normalizedCountry)},
      geo_lat = ${esc(payload.geoLat)},
      geo_lng = ${esc(payload.geoLng)},
      geo_precision = ${esc(BOAT_GEO_PRECISION)},
      geo_provider = ${esc(BOAT_GEO_PROVIDER)},
      geo_status = ${esc(payload.geoStatus)},
      geo_query = ${esc(payload.geoQuery)},
      geo_error = ${esc(payload.geoError)},
      geo_updated_at = ${esc(now)},
      geo_normalization_version = ${BOAT_GEO_NORMALIZATION_VERSION}
    WHERE id = ${boatId};
  `
}

async function resolveGeocode(query: string, country: string | null) {
  const response = await geocodeAppleMaps(query, {
    limitToCountries: country === 'US' ? 'US' : undefined,
  })

  return resolveAppleGeocodeMatch(
    {
      normalizedCity: query.split(',')[0]?.trim() || null,
      normalizedState: query.split(',')[1]?.trim() || null,
      normalizedCountry: country,
    },
    (response.results ?? []) as AppleGeocodeCandidate[],
  )
}

async function processRows(options: BackfillOptions) {
  const rows = loadTargetRows(options)
  const statements: string[] = []
  const statusCounts = new Map<string, number>()

  for (const row of rows) {
    const now = new Date().toISOString()
    const normalized = normalizeBoatGeo(row)
    let outcome = {
      geoStatus: normalized.geoStatus,
      geoError: normalized.geoError,
      geoLat: null as number | null,
      geoLng: null as number | null,
    }

    if (normalized.geoStatus !== 'skipped' && normalized.geoQuery) {
      const cached = readCachedGeocode(normalized.geoQuery, options)

      if (cached) {
        outcome = {
          geoStatus: cached.status,
          geoError: cached.error,
          geoLat: cached.lat,
          geoLng: cached.lng,
        }
      } else {
        try {
          const resolved = await resolveGeocode(normalized.geoQuery, normalized.normalizedCountry)
          outcome = resolved
          writeCachedGeocode(
            normalized.geoQuery,
            now,
            {
              status: resolved.geoStatus,
              lat: resolved.geoLat,
              lng: resolved.geoLng,
              error: resolved.geoError,
            },
            options,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'apple_geocode_failed'
          outcome = {
            geoStatus: 'failed',
            geoError: message,
            geoLat: null,
            geoLng: null,
          }
          writeCachedGeocode(
            normalized.geoQuery,
            now,
            {
              status: 'failed',
              lat: null,
              lng: null,
              error: message,
            },
            options,
          )
        }
      }
    }

    statements.push(
      buildBoatUpdateSql(row.id, now, {
        normalizedLocation: normalized.normalizedLocation,
        normalizedCity: normalized.normalizedCity,
        normalizedState: normalized.normalizedState,
        normalizedCountry: normalized.normalizedCountry,
        geoStatus: outcome.geoStatus,
        geoQuery: normalized.geoQuery,
        geoError: outcome.geoError,
        geoLat: outcome.geoLat,
        geoLng: outcome.geoLng,
      }),
    )
    statusCounts.set(outcome.geoStatus, (statusCounts.get(outcome.geoStatus) ?? 0) + 1)

    if (!options.dryRun && statements.length >= options.batchSize) {
      runD1Sql(statements.join('\n'), options)
      statements.length = 0
    }
  }

  if (!options.dryRun && statements.length > 0) {
    runD1Sql(statements.join('\n'), options)
  }

  return {
    rowsProcessed: rows.length,
    lastProcessedId: rows.at(-1)?.id ?? null,
    statusCounts,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const result = await processRows(options)

  console.log('🧭 Boat geo backfill complete')
  console.log(`   Mode:          ${options.isProduction ? 'production' : 'local'}`)
  console.log(`   Dry run:       ${options.dryRun ? 'yes' : 'no'}`)
  console.log(`   Rows processed:${result.rowsProcessed}`)
  console.log(`   Last boat id:  ${result.lastProcessedId ?? 'n/a'}`)
  for (const [status, count] of [...result.statusCounts.entries()].sort()) {
    console.log(`   ${status}: ${count}`)
  }
}

void main()
