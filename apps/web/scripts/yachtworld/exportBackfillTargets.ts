#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

type ListingUrlRow = {
  listing_id: string | null
  url: string
  updated_at: string
}

type StartUrlRow = {
  search_url: string
  started_at: string
  status: string
}

type WranglerJsonEnvelope<TRow> = Array<{
  results?: TRow[]
}>

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') {
    process.exit(0)
  }

  throw error
})

function parseCliOptions() {
  const { values } = parseArgs({
    options: {
      mode: {
        type: 'string',
        default: 'listing-urls',
      },
      source: {
        type: 'string',
        default: 'YachtWorld',
      },
      domain: {
        type: 'string',
        default: 'yachtworld.com',
      },
      format: {
        type: 'string',
        default: 'txt',
      },
      out: {
        type: 'string',
      },
    },
    allowPositionals: false,
  })

  if (values.mode !== 'listing-urls' && values.mode !== 'start-urls') {
    throw new Error(`Unsupported --mode "${values.mode}". Use "listing-urls" or "start-urls".`)
  }

  if (values.format !== 'txt' && values.format !== 'json') {
    throw new Error(`Unsupported --format "${values.format}". Use "txt" or "json".`)
  }

  return {
    mode: values.mode,
    source: values.source.trim(),
    domain: values.domain.trim().toLowerCase(),
    format: values.format,
    out: values.out?.trim() || null,
  }
}

function escapeSqlString(value: string) {
  return value.replaceAll("'", "''")
}

function extractJsonPayload(stdout: string) {
  const jsonStart = stdout.indexOf('[')
  if (jsonStart < 0) {
    throw new Error('Could not parse Wrangler JSON output.')
  }

  return stdout.slice(jsonStart)
}

function runRemoteQuery<TRow>(sqlText: string) {
  const stdout = execFileSync(
    'wrangler',
    ['d1', 'execute', 'boat-search-db', '--remote', '--command', sqlText],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    },
  )

  const payload = JSON.parse(extractJsonPayload(stdout)) as WranglerJsonEnvelope<TRow>
  return payload[0]?.results || []
}

function buildWeakListingSql(source: string) {
  const escapedSource = escapeSqlString(source)

  return `SELECT listing_id, url, updated_at
FROM boats
WHERE superseded_by_boat_id IS NULL
  AND source = '${escapedSource}'
  AND (
    (
      images IS NULL
      OR TRIM(images) = ''
      OR TRIM(images) = '[]'
      OR (json_valid(images) AND json_array_length(images) <= 1)
    )
    AND contact_info IS NULL
    AND other_details IS NULL
    AND features IS NULL
    AND propulsion IS NULL
    AND specifications IS NULL
  )
ORDER BY updated_at DESC;`
}

function buildStartUrlSql(domain: string) {
  const escapedDomain = escapeSqlString(domain)

  return `SELECT search_url, started_at, status
FROM crawl_jobs
WHERE search_url LIKE '%${escapedDomain}%'
ORDER BY started_at DESC;`
}

function collectDistinctStartUrls(rows: StartUrlRow[], domain: string) {
  const deduped = new Set<string>()

  for (const row of rows) {
    const urls = row.search_url
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean)

    for (const url of urls) {
      if (!url.includes(domain)) {
        continue
      }

      deduped.add(url)
    }
  }

  return [...deduped]
}

function renderOutput(
  options: ReturnType<typeof parseCliOptions>,
  listingRows: ListingUrlRow[],
  startUrls: string[],
) {
  if (options.mode === 'listing-urls') {
    if (options.format === 'json') {
      return `${JSON.stringify(listingRows, null, 2)}\n`
    }

    return `${listingRows.map((row) => row.url).join('\n')}\n`
  }

  if (options.format === 'json') {
    return `${JSON.stringify(startUrls, null, 2)}\n`
  }

  return `${startUrls.join('\n')}\n`
}

function main() {
  const options = parseCliOptions()
  const listingRows =
    options.mode === 'listing-urls'
      ? runRemoteQuery<ListingUrlRow>(buildWeakListingSql(options.source))
      : []
  const startUrls =
    options.mode === 'start-urls'
      ? collectDistinctStartUrls(
          runRemoteQuery<StartUrlRow>(buildStartUrlSql(options.domain)),
          options.domain,
        )
      : []

  const output = renderOutput(options, listingRows, startUrls)

  if (options.out) {
    writeFileSync(options.out, output, 'utf8')
  } else {
    process.stdout.write(output)
  }

  const count = options.mode === 'listing-urls' ? listingRows.length : startUrls.length
  process.stderr.write(
    `Exported ${count} ${options.mode === 'listing-urls' ? 'listing URL' : 'start URL'} target${count === 1 ? '' : 's'}.\n`,
  )
}

main()
