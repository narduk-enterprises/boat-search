#!/usr/bin/env node
/**
 * CLI: YachtWorld CSV → SQLite INSERT statements for `boats`.
 *
 * Usage:
 *   pnpm --filter web exec tsx scripts/yachtworld/csvToSql.ts /path/to/export.csv
 *   pnpm --filter web exec tsx scripts/yachtworld/csvToSql.ts ./dump.csv --out boats.sql
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  normalizeYachtWorldExport,
  parseYachtWorldCsvFile,
  type NormalizedYachtWorldBoat,
} from './csvNormalizer.ts'

function sqlText(value: string | null): string {
  if (value === null) return 'NULL'
  return `'${value.replaceAll("'", "''")}'`
}

function sqlInt(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'NULL'
  return String(Math.trunc(value))
}

function buildInsert(boat: NormalizedYachtWorldBoat): string {
  const imagesJson = boat.images.length > 0 ? JSON.stringify(boat.images) : null

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
  ] as const

  const values = [
    sqlText(boat.listingId),
    sqlText(boat.source),
    sqlText(boat.url),
    sqlText(boat.make),
    sqlText(boat.model),
    sqlInt(boat.year),
    sqlText(boat.length),
    sqlText(boat.price),
    sqlText(boat.currency),
    sqlText(boat.location),
    sqlText(boat.city),
    sqlText(boat.state),
    sqlText(boat.country),
    sqlText(boat.description),
    sqlText(boat.sellerType),
    sqlText(boat.listingType),
    sqlText(imagesJson),
    sqlText(boat.fullText),
    sqlText(boat.scrapedAt),
    sqlText(boat.updatedAt),
    'NULL',
    'NULL',
    'NULL',
    'NULL',
  ]

  return `INSERT INTO boats (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT(url) DO UPDATE SET listing_id = excluded.listing_id, source = excluded.source, make = excluded.make, model = excluded.model, year = excluded.year, length = excluded.length, price = excluded.price, currency = excluded.currency, location = excluded.location, city = excluded.city, state = excluded.state, country = excluded.country, description = excluded.description, seller_type = excluded.seller_type, listing_type = excluded.listing_type, images = excluded.images, full_text = excluded.full_text, scraped_at = excluded.scraped_at, updated_at = excluded.updated_at, search_length_min = excluded.search_length_min, search_length_max = excluded.search_length_max, search_type = excluded.search_type, search_location = excluded.search_location;`
}

function main() {
  const raw = process.argv.slice(2)
  // pnpm run <script> -- args invokes the script as `tsx … -- args` (separator before forwards)
  while (raw.length > 0 && raw[0] === '--') {
    raw.shift()
  }

  let outPath: string | null = null
  const args: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '--out') {
      outPath = raw[i + 1] ?? null
      i += 1
      continue
    }
    args.push(raw[i]!)
  }

  const csvPath = args[0]
  if (!csvPath) {
    console.error('Usage: tsx scripts/yachtworld/csvToSql.ts <export.csv> [--out boats.sql]')
    process.exit(1)
  }

  const absolute = resolve(csvPath)
  const content = readFileSync(absolute, 'utf8')
  const rows = parseYachtWorldCsvFile(content)
  const now = new Date().toISOString()
  const boats = normalizeYachtWorldExport(rows, { scrapedAt: now, updatedAt: now })

  const header = [
    '-- YachtWorld CSV → boats import',
    `-- Source file: ${absolute}`,
    `-- Generated at: ${now}`,
    `-- Row count (listings with URL): ${boats.length}`,
    '-- NOTE: This script upserts on active URL only. Run `pnpm boats:dedupe:rebuild` after importing to refresh canonical entities and diagnostics.',
    '',
    'BEGIN TRANSACTION;',
    '',
  ].join('\n')

  const body = boats.map((b) => buildInsert(b)).join('\n')
  const footer = '\n\nCOMMIT;\n'
  const sql = header + body + footer

  if (outPath) {
    writeFileSync(resolve(outPath), sql, 'utf8')
    console.error(`Wrote ${boats.length} INSERTs to ${resolve(outPath)}`)
  } else {
    process.stdout.write(sql)
  }
}

main()
