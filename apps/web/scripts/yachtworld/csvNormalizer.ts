/**
 * Parser + normalizer for YachtWorld Web Scraper CSV exports → boats table shape.
 * Description cleanup mirrors server/utils/boatInventory.ts (standalone script has no Nuxt aliases).
 */

import { parse } from 'csv-parse/sync'

export type YachtWorldCsvRow = Record<string, string>

export type NormalizedYachtWorldBoat = {
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: string | null
  currency: string
  location: string | null
  city: string | null
  state: string | null
  country: string
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  fullText: string | null
  scrapedAt: string
  updatedAt: string
}

const SOURCE = 'yachtworld.com'

/** Same rules as cleanBoatDescription in server/utils/boatInventory.ts */
export function cleanBoatDescriptionForImport(raw: string | null): string | null {
  if (!raw) return null

  let text = raw
    .replace(/^Description\s*/i, '')
    .replace(/First\s*(?:&\s*)?Last\s*Name[\s\S]*/i, '')
    .replaceAll(/EmailPhoneSubjectComments[\s\S]*/gi, '')
    .replaceAll(/Please contact [\s\S]*/gi, '')
    .replaceAll(/Contact Information[\s\S]*/gi, '')
    .replaceAll(/I'd like to know if the[\s\S]*/gi, '')
    .replaceAll(/Show\s*More[\s\S]*/gi, '')
    .replaceAll(/Trusted\s*Partner\s*\|[\s\S]*/gi, '')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/\s{2,}/g, ' ')
    .trim()

  if (text.length < 10) return null
  if (text.length > 2000) text = text.slice(0, 2000) + '...'

  return text
}

export function parseYachtWorldListingId(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, '')
  const m = trimmed.match(/\/yacht\/[^/]+-(\d+)$/)
  return m?.[1] ?? null
}

/** Two-word builder brands common on YachtWorld (extend as needed). */
const TWO_WORD_MAKES = new Set(
  [
    'cape horn',
    'sea hunt',
    'sea fox',
    'sea pro',
    'grady white',
    'midnight express',
    'boston whaler',
    'blackwater boats',
  ].map((s) => s.toLowerCase()),
)

export function parseMakeModelYear(title: string): {
  year: number | null
  make: string | null
  model: string | null
} {
  const t = title.trim()
  const m = t.match(/^(\d{4})\s+(.+)$/)
  if (!m) return { year: null, make: null, model: null }

  const year = Number.parseInt(m[1]!, 10)
  if (Number.isNaN(year)) return { year: null, make: null, model: null }

  const rest = m[2]!.trim()
  const parts = rest.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { year, make: null, model: null }
  if (parts.length === 1) return { year, make: parts[0]!, model: null }

  const tryTwo = `${parts[0]} ${parts[1]}`.toLowerCase()
  if (parts.length >= 3 && TWO_WORD_MAKES.has(tryTwo)) {
    return {
      year,
      make: `${parts[0]} ${parts[1]}`,
      model: parts.slice(2).join(' '),
    }
  }

  const make = parts[0]!
  const model = parts.slice(1).join(' ')
  return { year, make, model }
}

export function parseLengthFromTitle2(title2: string | undefined): string | null {
  if (!title2) return null
  const m = title2.match(/\|\s*(\d+)\s*ft\b/i)
  return m ? `${m[1]} ft` : null
}

/** Strips currency noise; keeps digits for text column (matches hydrateBoatRow Number.parseInt(price)). */
export function normalizePriceText(raw: string | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  return digits
}

export function resolveLocation(row: YachtWorldCsvRow): string {
  const loc = (row.location ?? '').trim()
  if (loc) return loc

  const data3 = (row.data3 ?? '').trim()
  const pipe = data3.indexOf('|')
  if (pipe >= 0) {
    const tail = data3.slice(pipe + 1).trim()
    if (tail) return tail
  }

  return ''
}

export function splitCityState(location: string): { city: string | null; state: string | null } {
  const trimmed = location.trim()
  if (!trimmed) return { city: null, state: null }

  const comma = trimmed.lastIndexOf(',')
  if (comma <= 0) return { city: trimmed, state: null }

  const city = trimmed.slice(0, comma).trim()
  const state = trimmed.slice(comma + 1).trim()
  return {
    city: city || null,
    state: state || null,
  }
}

function looksLikeEngineHours(value: string): boolean {
  const v = value.trim()
  if (!v) return false
  if (/^\$/.test(v)) return false
  if (/[,]/.test(v) && !/^\d{1,3}(,\d{3})+$/.test(v)) return false
  return /^\d+(\.\d+)?$/.test(v.replaceAll(',', ''))
}

export function inferSellerType(row: YachtWorldCsvRow): string | null {
  const broker = (row.broker_company_name ?? '').trim()
  const data3 = (row.data3 ?? '').trim()
  if (broker || (data3.includes('|') && data3.length > 0)) return 'dealer'
  const hours = (row.hours ?? '').trim()
  if (hours && looksLikeEngineHours(hours)) return 'dealer'
  return null
}

export function inferListingType(row: YachtWorldCsvRow): string | null {
  const d2 = (row.data_2 ?? '').trim()
  if (d2 && d2.length < 80 && !d2.startsWith('data:')) return d2
  return null
}

export function parseImageUrls(
  boatImages: string | undefined,
  boatImageX: string | undefined,
): string[] {
  const raw = [boatImages ?? '', boatImageX ?? ''].join('\n')
  const urls = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('http'))

  return [...new Set(urls)]
}

export function parseYachtWorldCsvFile(content: string): YachtWorldCsvRow[] {
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
  }) as YachtWorldCsvRow[]

  return rows
}

export function normalizeYachtWorldRow(
  row: YachtWorldCsvRow,
  options: { scrapedAt: string; updatedAt?: string },
): NormalizedYachtWorldBoat | null {
  const url = (row.item_page_link ?? '').trim()
  if (!url) return null

  const title = (row.title ?? row.title_1 ?? '').trim()
  const { year, make, model } = parseMakeModelYear(title)
  const length = parseLengthFromTitle2(row.title_2)

  const priceRaw = (row.price ?? row.data ?? '').trim()
  const price = normalizePriceText(priceRaw)

  const locationFull = resolveLocation(row)
  const { city, state } = splitCityState(locationFull)

  const description = cleanBoatDescriptionForImport((row.description ?? '').trim() || null)

  const images = parseImageUrls(row.boat_images, row.boat_image_x)

  const fullParts = [
    (row.item_page_title ?? '').trim(),
    locationFull ? `Location: ${locationFull}` : '',
    (row.data3 ?? '').trim(),
  ].filter(Boolean)

  const fullText = fullParts.length ? fullParts.join('\n\n') : null

  const updatedAt = options.updatedAt ?? options.scrapedAt

  return {
    listingId: parseYachtWorldListingId(url),
    source: SOURCE,
    url,
    make,
    model,
    year,
    length,
    price,
    currency: 'USD',
    location: locationFull || null,
    city,
    state,
    country: 'US',
    description,
    sellerType: inferSellerType(row),
    listingType: inferListingType(row),
    images,
    fullText,
    scrapedAt: options.scrapedAt,
    updatedAt,
  }
}

export function normalizeYachtWorldExport(
  rows: YachtWorldCsvRow[],
  options: { scrapedAt: string; updatedAt?: string },
): NormalizedYachtWorldBoat[] {
  const out: NormalizedYachtWorldBoat[] = []
  const seenUrl = new Set<string>()

  for (const row of rows) {
    const boat = normalizeYachtWorldRow(row, options)
    if (!boat) continue
    if (seenUrl.has(boat.url)) continue
    seenUrl.add(boat.url)
    out.push(boat)
  }

  return out
}
