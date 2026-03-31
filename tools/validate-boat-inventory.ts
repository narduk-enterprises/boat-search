#!/usr/bin/env -S pnpm exec tsx
/**
 * Validate active boat rows in D1 (local or remote) and verify R2 objects for /images/... URLs.
 *
 * D1: uses `wrangler d1 execute` from apps/web (same as tools/backfill-boat-geo.ts).
 * R2: verify objects in bucket boat-search-images using either:
 *   (A) S3-compatible HeadObject (fast; best for many keys), or
 *   (B) `wrangler r2 object get` with a Cloudflare API token (downloads each object; slower).
 *
 * Env for R2 (unless --skip-r2), option A — preferred for large inventories:
 *   CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   (or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY with R2 S3 credentials)
 *
 * Option B — if S3 vars are unset, token is read in this order:
 *   CLOUDFLARE_API_TOKEN_WORKERS, then CLOUDFLARE_API_TOKEN
 *   (e.g. hub `0_global-canonical-tokens` / config `cloudflare` → CLOUDFLARE_API_TOKEN_WORKERS)
 *
 * Usage:
 *   pnpm exec tsx tools/validate-boat-inventory.ts [--production] [--json] [--strict-fields]
 *     [--concurrency=32] [--page-size=100] [--max-boats=N] [--max-keys=N] [--skip-r2]
 *
 * YachtWorld extension backfill (one URL per line, stdout):
 *   --urls-missing-description | --urls-missing-year | --urls-empty-images
 *   (implies active rows, source YachtWorld; combine with --max-boats=N)
 */

import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { execFile as execFileCb, execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectR2KeysFromBoatImagesJson,
  isAppHostedBoatImageUrl,
  parseBoatImagesJson,
} from '../apps/web/lib/boatImageRefs'

const execFileAsync = promisify(execFileCb)

const __dirname = dirname(fileURLToPath(import.meta.url))

const D1_DATABASE = 'boat-search-db'
const WRANGLER_DIR = resolve(__dirname, '../apps/web')
const R2_BUCKET = 'boat-search-images'
/** Wrangler JSON can exceed default 1MB when `images` cells hold long JSON arrays. */
const WRANGLER_JSON_MAX_BUFFER_BYTES = 512 * 1024 * 1024

type D1JsonEnvelope = {
  results: Record<string, unknown>[]
  success: boolean
}

type UrlExportMode = 'missing_description' | 'missing_year' | 'images_empty'

type CliOptions = {
  isProduction: boolean
  json: boolean
  strictFields: boolean
  concurrency: number
  pageSize: number
  maxBoats: number | null
  maxKeys: number | null
  skipR2: boolean
  urlExport: UrlExportMode | null
}

type AggregateRow = {
  total_active: number
  missing_listing_id: number
  missing_make: number
  missing_model: number
  missing_year: number
  missing_price: number
  missing_description: number
  images_empty: number
  images_invalid_json: number
  images_text_maybe_app_hosted: number
}

type BoatImageRow = {
  id: number
  url: string
  images: string | null
}

type KeySample = { boatId: number; url: string }

function parseArgs(argv: string[]): CliOptions {
  let isProduction = false
  let json = false
  let strictFields = false
  let concurrency = 32
  let pageSize = 100
  let maxBoats: number | null = null
  let maxKeys: number | null = null
  let skipR2 = false
  let urlExport: UrlExportMode | null = null

  for (const arg of argv) {
    if (arg === '--production') isProduction = true
    else if (arg === '--json') json = true
    else if (arg === '--strict-fields') strictFields = true
    else if (arg === '--skip-r2') skipR2 = true
    else if (arg === '--urls-missing-description') urlExport = 'missing_description'
    else if (arg === '--urls-missing-year') urlExport = 'missing_year'
    else if (arg === '--urls-empty-images') urlExport = 'images_empty'
    else if (arg.startsWith('--concurrency='))
      concurrency = Math.max(1, Number.parseInt(arg.slice('--concurrency='.length), 10) || 32)
    else if (arg.startsWith('--page-size='))
      pageSize = Math.max(1, Number.parseInt(arg.slice('--page-size='.length), 10) || 100)
    else if (arg.startsWith('--max-boats=')) {
      const n = Number.parseInt(arg.slice('--max-boats='.length), 10)
      maxBoats = Number.isFinite(n) ? n : null
    } else if (arg.startsWith('--max-keys=')) {
      const n = Number.parseInt(arg.slice('--max-keys='.length), 10)
      maxKeys = Number.isFinite(n) ? n : null
    }
  }

  return {
    isProduction,
    json,
    strictFields,
    concurrency,
    pageSize,
    maxBoats,
    maxKeys,
    skipR2,
    urlExport,
  }
}

function buildYachtWorldUrlExportSql(mode: UrlExportMode, limit: number): string {
  const base = `
SELECT url FROM boats
WHERE superseded_by_boat_id IS NULL
  AND lower(trim(source)) = 'yachtworld'
`.replace(/\s+/g, ' ')

  const extra =
    mode === 'missing_description'
      ? ` AND (description IS NULL OR trim(description) = '')`
      : mode === 'missing_year'
        ? ` AND year IS NULL`
        : ` AND (images IS NULL OR trim(images) = '' OR trim(images) = '[]')`

  return `${base.trim()} ${extra} ORDER BY id LIMIT ${limit}`.replace(/\s+/g, ' ')
}

function fetchYachtWorldUrlsForExport(
  mode: UrlExportMode,
  isProduction: boolean,
  maxRows: number,
): string[] {
  const sql = buildYachtWorldUrlExportSql(mode, maxRows)
  const rows = runD1Json(sql, isProduction) as Record<string, unknown>[]
  return rows
    .map((row) => (typeof row.url === 'string' ? row.url.trim() : ''))
    .filter(Boolean)
}

function resolveLocalFlag(isProduction: boolean) {
  return isProduction ? '--remote' : '--local'
}

type WranglerD1ApiErrorBody = {
  error?: { code?: number; text?: string; notes?: Array<{ text?: string }> }
}

function formatRemoteD1AuthHint(apiDetail: string): string {
  return (
    'Remote D1 failed: wrangler needs a Cloudflare API token with D1 read on this account (e.g. API 7403).\n' +
    'Run with Doppler `prd` so CLOUDFLARE_API_TOKEN is injected:\n' +
    '  pnpm run boats:inventory:validate:production\n' +
    'or:\n' +
    '  doppler run --config prd -- pnpm exec tsx tools/validate-boat-inventory.ts --production\n' +
    (apiDetail ? `\nAPI detail: ${apiDetail}` : '')
  )
}

function parseWranglerD1SuccessEnvelope(output: string): Record<string, unknown>[] {
  const trimmed = output.trim()
  if (!trimmed) return []

  let body: unknown
  try {
    body = JSON.parse(trimmed) as unknown
  } catch {
    throw new Error(`Unexpected wrangler D1 output (not JSON): ${trimmed.slice(0, 240)}`)
  }

  if (body && typeof body === 'object' && !Array.isArray(body) && 'error' in body) {
    const err = body as WranglerD1ApiErrorBody
    const code = err.error?.code
    const note = err.error?.notes?.[0]?.text ?? err.error?.text ?? ''
    throw new Error(
      formatRemoteD1AuthHint(`${code != null ? `[code ${code}] ` : ''}${note}`.trim()),
    )
  }

  const first = Array.isArray(body) ? body[0] : body
  if (!first || typeof first !== 'object') return []
  const results = (first as D1JsonEnvelope).results
  return Array.isArray(results) ? results : []
}

function runD1Json(sql: string, isProduction: boolean): Record<string, unknown>[] {
  const escaped = sql.replace(/"/g, '\\"')
  let output: string
  try {
    output = execSync(
      `wrangler d1 execute ${D1_DATABASE} ${resolveLocalFlag(isProduction)} --command "${escaped}" --json`,
      {
        cwd: WRANGLER_DIR,
        stdio: 'pipe',
        encoding: 'utf8',
        maxBuffer: WRANGLER_JSON_MAX_BUFFER_BYTES,
      },
    ) as string
  } catch (caught) {
    const e = caught as { stdout?: string | Buffer }
    const stdout = (typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8')) ?? ''
    const trimmed = stdout.trim()
    if (trimmed.startsWith('{') && trimmed.includes('"error"')) {
      try {
        const body = JSON.parse(trimmed) as WranglerD1ApiErrorBody
        if (body.error) {
          const code = body.error.code
          const note = body.error.notes?.[0]?.text ?? body.error.text ?? ''
          throw new Error(
            formatRemoteD1AuthHint(`${code != null ? `[code ${code}] ` : ''}${note}`.trim()),
          )
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message.includes('doppler run --config prd')) {
          throw inner
        }
      }
    }
    throw caught instanceof Error ? caught : new Error(String(caught))
  }

  return parseWranglerD1SuccessEnvelope(output)
}

function num(row: Record<string, unknown>, key: string): number {
  const v = row[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v !== '') return Number.parseInt(v, 10) || 0
  return 0
}

function fetchAggregates(isProduction: boolean): AggregateRow {
  const sql = `
SELECT
  COUNT(*) AS total_active,
  SUM(CASE WHEN listing_id IS NULL OR trim(listing_id) = '' THEN 1 ELSE 0 END) AS missing_listing_id,
  SUM(CASE WHEN make IS NULL OR trim(make) = '' THEN 1 ELSE 0 END) AS missing_make,
  SUM(CASE WHEN model IS NULL OR trim(model) = '' THEN 1 ELSE 0 END) AS missing_model,
  SUM(CASE WHEN year IS NULL THEN 1 ELSE 0 END) AS missing_year,
  SUM(CASE WHEN price IS NULL OR trim(price) = '' THEN 1 ELSE 0 END) AS missing_price,
  SUM(CASE WHEN description IS NULL OR trim(description) = '' THEN 1 ELSE 0 END) AS missing_description,
  SUM(CASE WHEN images IS NULL OR trim(images) = '' OR trim(images) = '[]' THEN 1 ELSE 0 END) AS images_empty,
  SUM(CASE WHEN images IS NOT NULL AND trim(images) != '' AND trim(images) != '[]' AND json_valid(images) = 0 THEN 1 ELSE 0 END) AS images_invalid_json,
  SUM(CASE WHEN images LIKE '%/images/%' THEN 1 ELSE 0 END) AS images_text_maybe_app_hosted
FROM boats
WHERE superseded_by_boat_id IS NULL
`.replace(/\s+/g, ' ')

  const rows = runD1Json(sql, isProduction)
  const r = rows[0] ?? {}
  return {
    total_active: num(r, 'total_active'),
    missing_listing_id: num(r, 'missing_listing_id'),
    missing_make: num(r, 'missing_make'),
    missing_model: num(r, 'missing_model'),
    missing_year: num(r, 'missing_year'),
    missing_price: num(r, 'missing_price'),
    missing_description: num(r, 'missing_description'),
    images_empty: num(r, 'images_empty'),
    images_invalid_json: num(r, 'images_invalid_json'),
    images_text_maybe_app_hosted: num(r, 'images_text_maybe_app_hosted'),
  }
}

function* paginateBoatsWithImageHint(
  isProduction: boolean,
  pageSize: number,
  maxBoats: number | null,
): Generator<BoatImageRow[], void, unknown> {
  let lastId = 0
  let yielded = 0

  while (true) {
    const limit = maxBoats == null ? pageSize : Math.min(pageSize, maxBoats - yielded)
    if (limit <= 0) break

    const sql = `
SELECT id, url, images FROM boats
WHERE superseded_by_boat_id IS NULL
  AND images LIKE '%/images/%'
  AND id > ${lastId}
ORDER BY id
LIMIT ${limit}
`.replace(/\s+/g, ' ')

    const rows = runD1Json(sql, isProduction) as Record<string, unknown>[]
    if (rows.length === 0) break

    const batch: BoatImageRow[] = rows.map((row) => ({
      id: num(row, 'id'),
      url: typeof row.url === 'string' ? row.url : '',
      images: typeof row.images === 'string' ? row.images : row.images == null ? null : String(row.images),
    }))

    yield batch
    yielded += batch.length
    lastId = batch[batch.length - 1]?.id ?? lastId

    if (rows.length < limit) break
    if (maxBoats != null && yielded >= maxBoats) break
  }
}

function tryCreateR2S3Client(): S3Client | null {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID)?.trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID)?.trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY)?.trim()

  if (!accountId || !accessKeyId || !secretAccessKey) return null

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })
}

/** Prefer Workers token so it wins over a generic CLOUDFLARE_API_TOKEN from app Doppler. */
function resolveCloudflareApiTokenForR2(): string | null {
  const t = (process.env.CLOUDFLARE_API_TOKEN_WORKERS ?? process.env.CLOUDFLARE_API_TOKEN)?.trim()
  return t.length > 0 ? t : null
}

function stripAnsi(text: string) {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '')
}

function wranglerExecErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'stderr' in err) {
    const s = (err as { stderr?: Buffer }).stderr
    if (s?.length) return stripAnsi(s.toString().trim()).slice(0, 400)
  }
  return stripAnsi(err instanceof Error ? err.message : String(err)).slice(0, 400)
}

async function headOneKeyViaWrangler(key: string, cfToken: string): Promise<Error | null> {
  const tmp = join(tmpdir(), `r2-inv-${randomUUID()}`)
  try {
    await execFileAsync(
      'wrangler',
      ['r2', 'object', 'get', `${R2_BUCKET}/${key}`, '--remote', '--file', tmp],
      {
        cwd: WRANGLER_DIR,
        env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken },
        maxBuffer: 4_000_000,
      },
    )
    return null
  } catch (err) {
    return new Error(wranglerExecErrorMessage(err))
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

async function headKeysViaWrangler(
  keys: string[],
  cfToken: string,
  concurrency: number,
): Promise<Map<string, Error | null>> {
  const outcomes = new Map<string, Error | null>()
  let index = 0
  const cap = Math.max(1, Math.min(concurrency, 16))

  async function worker() {
    while (index < keys.length) {
      const i = index
      index += 1
      const key = keys[i]!
      const err = await headOneKeyViaWrangler(key, cfToken)
      outcomes.set(key, err)
    }
  }

  await Promise.all(Array.from({ length: Math.min(cap, keys.length) }, () => worker()))
  return outcomes
}

async function headKeysConcurrently(
  client: S3Client,
  keys: string[],
  concurrency: number,
): Promise<Map<string, Error | null>> {
  const outcomes = new Map<string, Error | null>()
  let index = 0

  async function worker() {
    while (index < keys.length) {
      const i = index
      index += 1
      const key = keys[i]!
      try {
        await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        outcomes.set(key, null)
      } catch (err) {
        outcomes.set(key, err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, keys.length) }, () => worker())
  await Promise.all(workers)
  return outcomes
}

async function main() {
  const opts = parseArgs(process.argv.slice(2).filter((a) => a !== '--'))

  if (opts.urlExport) {
    const cap = opts.maxBoats != null ? Math.min(opts.maxBoats, 100_000) : 50_000
    const urls = fetchYachtWorldUrlsForExport(opts.urlExport, opts.isProduction, cap)
    for (const url of urls) {
      console.log(url)
    }
    process.exit(0)
  }

  const aggregates = fetchAggregates(opts.isProduction)

  const keyToSamples = new Map<string, KeySample[]>()
  let boatsScanned = 0
  let boatsWithParsedAppHostedUrl = 0
  let boatsLikeHintButNoParsedKeys = 0

  for (const batch of paginateBoatsWithImageHint(opts.isProduction, opts.pageSize, opts.maxBoats)) {
    for (const row of batch) {
      boatsScanned += 1
      const urls = parseBoatImagesJson(row.images)
      const hasAppHosted = urls.some((u) => isAppHostedBoatImageUrl(u))
      if (hasAppHosted) boatsWithParsedAppHostedUrl += 1
      else boatsLikeHintButNoParsedKeys += 1

      const keys = collectR2KeysFromBoatImagesJson(row.images)
      for (const key of keys) {
        const list = keyToSamples.get(key) ?? []
        if (list.length < 3) list.push({ boatId: row.id, url: row.url })
        keyToSamples.set(key, list)
      }
    }
  }

  let sortedKeys = [...keyToSamples.keys()].sort()
  if (opts.maxKeys != null && opts.maxKeys < sortedKeys.length) {
    sortedKeys = sortedKeys.slice(0, opts.maxKeys)
  }

  let missingR2: { key: string; samples: KeySample[]; message: string }[] = []
  let r2Error: string | null = null
  let r2Method: 'none' | 's3' | 'wrangler' = 'none'

  if (!opts.skipR2) {
    if (sortedKeys.length === 0) {
      // nothing to verify
    } else {
      try {
        const s3 = tryCreateR2S3Client()
        let outcomes: Map<string, Error | null>
        if (s3) {
          r2Method = 's3'
          outcomes = await headKeysConcurrently(s3, sortedKeys, opts.concurrency)
        } else {
          const cfToken = resolveCloudflareApiTokenForR2()
          if (!cfToken) {
            throw new Error(
              'Missing R2 auth: set R2 S3 keys (R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + CLOUDFLARE_ACCOUNT_ID), or set CLOUDFLARE_API_TOKEN_WORKERS / CLOUDFLARE_API_TOKEN for wrangler r2 object get — or pass --skip-r2',
            )
          }
          r2Method = 'wrangler'
          const wranglerConcurrency = Math.min(opts.concurrency, 8)
          outcomes = await headKeysViaWrangler(sortedKeys, cfToken, wranglerConcurrency)
        }
        for (const key of sortedKeys) {
          const err = outcomes.get(key)
          if (err) {
            missingR2.push({
              key,
              samples: keyToSamples.get(key) ?? [],
              message: err.message,
            })
          }
        }
      } catch (e) {
        r2Error = e instanceof Error ? e.message : String(e)
      }
    }
  }

  const strictViolation =
    opts.strictFields &&
    (aggregates.missing_listing_id > 0 ||
      aggregates.missing_make > 0 ||
      aggregates.missing_model > 0 ||
      aggregates.missing_year > 0 ||
      aggregates.missing_price > 0 ||
      aggregates.missing_description > 0 ||
      aggregates.images_empty > 0 ||
      aggregates.images_invalid_json > 0)

  const success =
    !strictViolation &&
    r2Error == null &&
    (opts.skipR2 || missingR2.length === 0)

  const report = {
    ok: success,
    environment: opts.isProduction ? 'remote_d1' : 'local_d1',
    aggregates,
    imageScan: {
      boatsScannedWithLikeHint: boatsScanned,
      boatsWithParsedAppHostedImageUrl: boatsWithParsedAppHostedUrl,
      boatsLikeHintButNoParsedAppHostedUrl: boatsLikeHintButNoParsedKeys,
      uniqueR2KeysConsidered: sortedKeys.length,
      uniqueR2KeysTotal: keyToSamples.size,
    },
    r2: opts.skipR2
      ? { skipped: true }
      : {
          skipped: false,
          bucket: R2_BUCKET,
          method: r2Method,
          missingObjects: missingR2,
          configureError: r2Error,
        },
    strictFields: opts.strictFields,
    strictViolation,
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Boat inventory validation (${report.environment})`)
    console.log('')
    console.log('Aggregates (active listings only):')
    console.log(`  total_active:                    ${aggregates.total_active}`)
    console.log(`  missing_listing_id:              ${aggregates.missing_listing_id}`)
    console.log(`  missing_make:                    ${aggregates.missing_make}`)
    console.log(`  missing_model:                   ${aggregates.missing_model}`)
    console.log(`  missing_year:                    ${aggregates.missing_year}`)
    console.log(`  missing_price:                   ${aggregates.missing_price}`)
    console.log(`  missing_description:             ${aggregates.missing_description}`)
    console.log(`  images_empty:                    ${aggregates.images_empty}`)
    console.log(`  images_invalid_json:             ${aggregates.images_invalid_json}`)
    console.log(`  images_text_maybe_app_hosted:    ${aggregates.images_text_maybe_app_hosted}`)
    console.log('')
    console.log('Image / R2 key scan (rows with images LIKE "%/images/%"):')
    console.log(`  boats_scanned:                   ${boatsScanned}`)
    console.log(`  boats_with_parsed_app_hosted:    ${boatsWithParsedAppHostedUrl}`)
    console.log(`  like_hint_but_unparsed_hosted:   ${boatsLikeHintButNoParsedKeys}`)
    console.log(`  unique_r2_keys (total distinct): ${keyToSamples.size}`)
    console.log(`  unique_r2_keys (selected):       ${sortedKeys.length}`)
    if (opts.skipR2) {
      console.log('')
      console.log('R2: skipped (--skip-r2)')
    } else if (r2Error) {
      console.log('')
      console.log(`R2: configuration error — ${r2Error}`)
      console.log('   (HeadObject was not run; fix env and re-run.)')
    } else {
      console.log('')
      const via =
        r2Method === 's3' ? 'S3 HeadObject' : r2Method === 'wrangler' ? 'wrangler r2 object get' : 'unknown'
      console.log(`R2: bucket ${R2_BUCKET} — via ${via} — missing_objects: ${missingR2.length}`)
      if (r2Method === 'wrangler' && sortedKeys.length > 50) {
        console.log(
          '   Note: wrangler mode downloads each object; for full inventory prefer R2 S3 API keys.',
        )
      }
      for (const m of missingR2.slice(0, 20)) {
        console.log(`  - key: ${m.key}`)
        console.log(`    error: ${m.message}`)
        for (const s of m.samples) {
          console.log(`    boat ${s.boatId}  ${s.url}`)
        }
      }
      if (missingR2.length > 20) console.log(`  ... and ${missingR2.length - 20} more`)
    }
    if (opts.strictFields && strictViolation) {
      console.log('')
      console.log('Strict fields: FAILED (see zero counts required above)')
    }
    console.log('')
    console.log(success ? 'Result: OK' : 'Result: FAILED')
  }

  process.exit(success ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
