/**
 * YachtWorld __REDUX_STATE__ Extractor
 *
 * Parses raw HTML captured from YachtWorld detail pages and extracts
 * structured boat data from the embedded `__REDUX_STATE__` JavaScript object.
 *
 * This module has zero runtime dependencies — it works in Node.js (backfill
 * scripts), Cloudflare Workers (live pipeline), and Vitest (tests).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single engine entry from the Redux propulsion.engines array. */
export interface ReduxEngine {
  model: string | null
  year: number | null
  category: string | null
  driveType: string | null
  hours: number | null
  fuel: string | null
  propellerType: string | null
  propellerMaterial: string | null
  location: string | null
  ropeCutter: boolean
  foldingPropeller: boolean
}

/** A media item from the Redux media array. */
export interface ReduxMedia {
  sortOrder: number
  url: string
  externalUrl: string | null
  mediaType: string
  width: number
  height: number
  format: string
}

/** The extracted Redux listing data shaped as a flat set of D1-compatible values. */
export interface ReduxExtractedBoatData {
  // Identity
  listingId: string | null
  url: string | null

  // Core
  make: string | null
  model: string | null
  year: number | null
  price: number | null
  currency: string | null
  condition: string | null
  boatClass: string | null

  // Location
  city: string | null
  state: string | null
  country: string | null
  geoLat: number | null
  geoLng: number | null

  // Description
  description: string | null

  // Contact
  contactName: string | null
  contactPhone: string | null
  contactInfo: string | null

  // Seller
  sellerType: string | null
  listingType: string | null

  // Propulsion
  engineMake: string | null
  engineModel: string | null
  engineYearDetail: string | null
  totalPower: string | null
  engineHours: string | null
  engineTypeDetail: string | null
  driveType: string | null
  fuelTypeDetail: string | null
  propellerType: string | null
  propellerMaterial: string | null
  propulsion: string | null

  // Hull
  hullMaterial: string | null
  keelType: string | null
  hin: string | null

  // Specifications
  cruisingSpeed: string | null
  maxSpeed: string | null
  range: string | null
  lengthOverall: string | null
  maxBridgeClearance: string | null
  maxDraft: string | null
  beamDetail: string | null
  dryWeight: string | null
  deadriseAtTransom: string | null
  specifications: string | null

  // Tanks
  freshWaterTank: string | null
  fuelTank: string | null
  holdingTank: string | null

  // Other
  features: string | null
  otherDetails: string | null

  // Images — full-resolution CDN URLs from the Redux media array
  images: string[]
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the `__REDUX_STATE__` JSON object from a raw HTML string.
 * The YachtWorld detail page embeds this in a `<script>` tag as:
 *   `var __REDUX_STATE__ = {...};`
 *   or `var __REDUX_STATE__={...}`
 */
export function parseReduxStateFromHtml(html: string): Record<string, unknown> | null {
  // eslint-disable-next-line regexp/no-super-linear-backtracking -- bounded by script tag end
  const match = html.match(/var\s+__REDUX_STATE__\s*=\s*(\{.*?\})\s*;?\s*<\/script>/s)
  if (!match?.[1]) {
    return null
  }

  try {
    return JSON.parse(match[1]) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Safely navigates a nested object path, returning `null` on any missing key.
 */
function dig(obj: unknown, ...keys: string[]): unknown {
  let current = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') {
      return null
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current ?? null
}

function str(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s || null
}

function num(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Dimension helpers
// ---------------------------------------------------------------------------

interface FtMDimension {
  ft: number | null
  m: number | null
}

function formatDimension(dim: unknown, unit: 'ft' | 'm' = 'ft'): string | null {
  if (dim == null || typeof dim !== 'object') return null
  const d = dim as FtMDimension
  if (d.ft != null && Number.isFinite(d.ft)) {
    return `${d.ft} ft`
  }
  if (d.m != null && Number.isFinite(d.m)) {
    if (unit === 'm') return `${d.m} m`
    return `${(d.m * 3.28084).toFixed(1)} ft`
  }
  return null
}

// ---------------------------------------------------------------------------
// Tank formatter
// ---------------------------------------------------------------------------

interface TankEntry {
  material?: string | null
  capacity?: { gal?: number; litre?: number } | null
}

function formatTanks(arr: unknown): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null
  const parts: string[] = []
  for (const tank of arr as TankEntry[]) {
    const cap = tank?.capacity
    if (cap?.gal != null && Number.isFinite(cap.gal)) {
      const mat = tank.material ? ` (${tank.material})` : ''
      parts.push(`${cap.gal} gal${mat}`)
    } else if (cap?.litre != null && Number.isFinite(cap.litre)) {
      const mat = tank.material ? ` (${tank.material})` : ''
      parts.push(`${cap.litre} L${mat}`)
    }
  }
  return parts.length ? parts.join(' | ') : null
}

// ---------------------------------------------------------------------------
// Engine helpers
// ---------------------------------------------------------------------------

function splitEngineModel(modelStr: string | null): { make: string | null; model: string | null } {
  if (!modelStr) return { make: null, model: null }

  // Common patterns: "Mercruiser 6.2 L", "Yamaha F350 XSA", "Mercury 60 hp"
  const parts = modelStr.trim().split(/\s+/)
  if (parts.length === 0) return { make: null, model: null }
  if (parts.length === 1) return { make: parts[0]!, model: null }

  return {
    make: parts[0]!,
    model: parts.slice(1).join(' '),
  }
}

function formatEnginesSummary(engines: ReduxEngine[]): string | null {
  if (!engines.length) return null
  const summaries = engines.map((e, i) => {
    const parts = [`Engine ${i + 1}`]
    if (e.model) parts.push(e.model)
    if (e.year) parts.push(`(${e.year})`)
    if (e.hours != null) parts.push(`${e.hours} hrs`)
    if (e.fuel) parts.push(e.fuel)
    if (e.driveType) parts.push(e.driveType)
    return parts.join(' | ')
  })
  return summaries.join(' || ')
}

// ---------------------------------------------------------------------------
// Contact formatter
// ---------------------------------------------------------------------------

function formatContactInfo(contact: unknown): string | null {
  if (contact == null || typeof contact !== 'object') return null
  const c = contact as Record<string, unknown>
  const parts: string[] = []

  const name = str(c.name)
  if (name) parts.push(name)

  const addr = c.address as Record<string, unknown> | null
  if (addr) {
    const addrParts = [
      str(addr.street),
      str(addr.street2),
      str(addr.city),
      str(addr.subdivision),
      str(addr.postalCode),
      str(addr.country),
    ].filter(Boolean)
    if (addrParts.length) parts.push(addrParts.join(', '))
  }

  const phone = str(c.phone)
  if (phone) parts.push(phone)

  const website = str(c.website)
  if (website) parts.push(website)

  return parts.length ? parts.join(' | ') : null
}

// ---------------------------------------------------------------------------
// Specs formatter
// ---------------------------------------------------------------------------

function formatSpecifications(specs: unknown): string | null {
  if (specs == null || typeof specs !== 'object') return null
  const s = specs as Record<string, unknown>
  const parts: string[] = []

  // Dimensions
  const dims = s.dimensions as Record<string, unknown> | null
  if (dims) {
    const beam = formatDimension(dims.beam)
    if (beam) parts.push(`Beam: ${beam}`)
    const draft = formatDimension(dims.maxDraft)
    if (draft) parts.push(`Max Draft: ${draft}`)
    const bridge = formatDimension(dims.maxBridgeClearance)
    if (bridge) parts.push(`Max Bridge Clearance: ${bridge}`)
    const lengths = dims.lengths as Record<string, unknown> | null
    if (lengths) {
      const overall = formatDimension(lengths.overall)
      if (overall) parts.push(`Length Overall: ${overall}`)
      const nominal = formatDimension(lengths.nominal)
      if (nominal) parts.push(`Nominal Length: ${nominal}`)
    }
    const deadrise = str(dims.deadriseAtTransom)
    if (deadrise) parts.push(`Deadrise at Transom: ${deadrise}`)
  }

  // Weights
  const weights = s.weights as Record<string, unknown> | null
  if (weights) {
    const dry = weights.dry as { lb?: number; kg?: number } | null
    if (dry?.lb != null && Number.isFinite(dry.lb)) parts.push(`Dry Weight: ${dry.lb} lbs`)
    else if (dry?.kg != null && Number.isFinite(dry.kg)) parts.push(`Dry Weight: ${dry.kg} kg`)
  }

  // Speed/Distance
  const speed = s.speedDistance as Record<string, unknown> | null
  if (speed) {
    const cruising = speed.cruisingSpeed as { kn?: number } | null
    if (cruising?.kn != null && Number.isFinite(cruising.kn))
      parts.push(`Cruising Speed: ${cruising.kn} kn`)
    const max = speed.maxHullSpeed as { kn?: number } | null
    if (max?.kn != null && Number.isFinite(max.kn)) parts.push(`Max Speed: ${max.kn} kn`)
    const rangeVal = speed.range as { nm?: number } | null
    if (rangeVal?.nm != null && Number.isFinite(rangeVal.nm)) parts.push(`Range: ${rangeVal.nm} nm`)
  }

  return parts.length ? parts.join(' | ') : null
}

// ---------------------------------------------------------------------------
// Features / Other Details
// ---------------------------------------------------------------------------

function formatFeatures(features: unknown): string | null {
  if (features == null || typeof features !== 'object') return null
  const f = features as Record<string, unknown>
  const parts: string[] = []

  const equipment = f.equipment as Record<string, unknown> | null
  if (equipment) {
    for (const [key, value] of Object.entries(equipment)) {
      if (value != null && value !== false) {
        const label = key.replaceAll(/([A-Z])/g, ' $1').trim()
        parts.push(value === true ? label : `${label}: ${String(value)}`)
      }
    }
  }

  return parts.length ? parts.join(' | ') : null
}

function formatOtherDetails(data: Record<string, unknown>): string | null {
  const parts: string[] = []

  const tanks = data.tanks as Record<string, unknown[]> | null
  if (tanks) {
    const fresh = formatTanks(tanks.freshWater)
    if (fresh) parts.push(`Fresh Water: ${fresh}`)
    const fuel = formatTanks(tanks.fuel)
    if (fuel) parts.push(`Fuel: ${fuel}`)
    const holding = formatTanks(tanks.holding)
    if (holding) parts.push(`Holding: ${holding}`)
  }

  const accom = data.specifications as Record<string, unknown> | null
  const accommodation = accom ? (accom.accommodation as Record<string, unknown> | null) : null
  if (accommodation && Object.keys(accommodation).length) {
    for (const [key, value] of Object.entries(accommodation)) {
      if (value != null) {
        const label = key.replaceAll(/([A-Z])/g, ' $1').trim()
        parts.push(`${label}: ${String(value)}`)
      }
    }
  }

  const legal = data.legal as Record<string, unknown> | null
  if (legal) {
    const builder = str(legal.builderName)
    if (builder) parts.push(`Builder: ${builder}`)
    const designer = str(legal.designerName)
    if (designer) parts.push(`Designer: ${designer}`)
  }

  return parts.length ? parts.join(' | ') : null
}

// ---------------------------------------------------------------------------
// Image extraction
// ---------------------------------------------------------------------------

/**
 * Extracts full-resolution CDN image URLs from the Redux media array.
 * These are the base Boats Group CDN URLs without any resize/crop query params.
 */
function extractImages(media: unknown): string[] {
  if (!Array.isArray(media)) return []

  const images: Array<{ sortOrder: number; url: string }> = []

  for (const item of media) {
    if (item == null || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    if (m.mediaType !== 'image') continue
    const url = str(m.url)
    if (!url) continue
    images.push({
      sortOrder: num(m.sortOrder) ?? 999,
      url,
    })
  }

  // Sort by sortOrder to maintain gallery ordering
  images.sort((a, b) => a.sortOrder - b.sortOrder)
  return images.map((i) => i.url)
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

/**
 * Extracts structured boat data from a YachtWorld detail page's raw HTML
 * by parsing the embedded `__REDUX_STATE__` JavaScript object.
 *
 * Returns `null` if `__REDUX_STATE__` cannot be found or parsed.
 */
export function extractBoatDataFromHtml(html: string): ReduxExtractedBoatData | null {
  const redux = parseReduxStateFromHtml(html)
  if (!redux) return null

  const data = dig(redux, 'app', 'data') as Record<string, unknown> | null
  if (!data || typeof data !== 'object') return null

  // Engines
  const engines = (dig(data, 'propulsion', 'engines') as ReduxEngine[]) || []
  const primaryEngine = engines[0] ?? null
  const engineParts = splitEngineModel(str(primaryEngine?.model))

  // Specifications
  const specs = data.specifications as Record<string, unknown> | null
  const dims = dig(specs, 'dimensions') as Record<string, unknown> | null
  const weights = dig(specs, 'weights') as Record<string, unknown> | null
  const speedDist = dig(specs, 'speedDistance') as Record<string, unknown> | null

  // Location
  const location = data.location as Record<string, unknown> | null
  const coordinates = dig(location, 'coordinates') as number[] | null
  // YachtWorld coordinates are [lng, lat] (GeoJSON order)
  const geoLng = coordinates?.[0] != null && Number.isFinite(coordinates[0]) ? coordinates[0] : null
  const geoLat = coordinates?.[1] != null && Number.isFinite(coordinates[1]) ? coordinates[1] : null

  // Contact
  const contact = data.contact as Record<string, unknown> | null

  // Price — prefer USD amount from the price object
  const priceObj = dig(data, 'price', 'type', 'amount') as Record<string, number> | null
  const priceUsd = priceObj?.USD ?? null

  // Hull
  const hull = data.hull as Record<string, unknown> | null

  // Speed values
  const cruisingKn = dig(speedDist, 'cruisingSpeed', 'kn') as number | null
  const maxKn = dig(speedDist, 'maxHullSpeed', 'kn') as number | null
  const rangeNm = dig(speedDist, 'range', 'nm') as number | null

  // Dry weight
  const dryLb = dig(weights, 'dry', 'lb') as number | null
  const dryKg = dig(weights, 'dry', 'kg') as number | null

  // Deadrise
  const deadriseRaw = dig(dims, 'deadriseAtTransom') as { deg?: number } | null

  // Class — combine type and class
  const boatType = str(data.type)
  const boatClassRaw = str(data.class)
  const boatClass = boatClassRaw || boatType || null

  return {
    // Identity
    listingId: str(data.id),
    url: str(data.portalLink),

    // Core
    make: str(data.make),
    model: str(data.model),
    year: num(data.year),
    price: priceUsd != null && Number.isFinite(priceUsd) ? priceUsd : null,
    currency: priceUsd != null ? 'USD' : null,
    condition: str(data.condition),
    boatClass,

    // Location
    city: str(dig(location, 'address', 'city')),
    state: str(dig(location, 'address', 'subdivision')),
    country: str(dig(location, 'address', 'country')),
    geoLat,
    geoLng,

    // Description
    description: str(data.descriptionNoHTML),

    // Contact
    contactName: str(dig(contact, 'name')),
    contactPhone: str(dig(contact, 'phone')),
    contactInfo: formatContactInfo(contact),

    // Seller
    sellerType: str(dig(data, 'owner', 'type')),
    listingType: str(dig(data, 'legal', 'listingTypeId')),

    // Propulsion
    engineMake: engineParts.make,
    engineModel: engineParts.model,
    engineYearDetail: primaryEngine?.year != null ? String(primaryEngine.year) : null,
    totalPower: null, // Not directly available in Redux
    engineHours: primaryEngine?.hours != null ? String(primaryEngine.hours) : null,
    engineTypeDetail: str(primaryEngine?.category),
    driveType: str(primaryEngine?.driveType),
    fuelTypeDetail: str(primaryEngine?.fuel) || str(data.fuelType),
    propellerType: str(primaryEngine?.propellerType),
    propellerMaterial: str(primaryEngine?.propellerMaterial),
    propulsion: formatEnginesSummary(engines),

    // Hull
    hullMaterial: str(dig(hull, 'material')),
    keelType: str(dig(hull, 'keelType')),
    hin: str(dig(hull, 'hin')),

    // Specifications — individual fields
    cruisingSpeed: cruisingKn != null && Number.isFinite(cruisingKn) ? `${cruisingKn} kn` : null,
    maxSpeed: maxKn != null && Number.isFinite(maxKn) ? `${maxKn} kn` : null,
    range: rangeNm != null && Number.isFinite(rangeNm) ? `${rangeNm} nm` : null,
    lengthOverall: formatDimension(dig(dims, 'lengths', 'overall')),
    maxBridgeClearance: formatDimension(dig(dims, 'maxBridgeClearance')),
    maxDraft: formatDimension(dig(dims, 'maxDraft')),
    beamDetail: formatDimension(dig(dims, 'beam')),
    dryWeight:
      dryLb != null && Number.isFinite(dryLb)
        ? `${dryLb} lbs`
        : dryKg != null && Number.isFinite(dryKg)
          ? `${dryKg} kg`
          : null,
    deadriseAtTransom:
      deadriseRaw?.deg != null && Number.isFinite(deadriseRaw.deg) ? `${deadriseRaw.deg}°` : null,
    specifications: formatSpecifications(specs),

    // Tanks
    freshWaterTank: formatTanks(dig(data, 'tanks', 'freshWater')),
    fuelTank: formatTanks(dig(data, 'tanks', 'fuel')),
    holdingTank: formatTanks(dig(data, 'tanks', 'holding')),

    // Features / Other details
    features: formatFeatures(data.features),
    otherDetails: formatOtherDetails(data),

    // Images — full-resolution CDN URLs
    images: extractImages(data.media),
  }
}

/**
 * Given an existing D1 boat row and extracted Redux data, returns an object
 * containing only the fields that should be updated. Fields are included when:
 * 1. The Redux value is non-null/empty, AND
 * 2. Either the existing D1 value is null/empty, OR the Redux value is "richer"
 *    (longer string, more items, etc.)
 *
 * Special handling:
 * - `images`: always replaced if Redux provides any (full-res vs thumbnails)
 * - `geoLat`/`geoLng`: always replaced if Redux provides them
 * - New columns (hin, boatClass, condition): always set if Redux has them
 */
export function buildBoatUpdatePatch(
  existing: Record<string, unknown>,
  extracted: ReduxExtractedBoatData,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  function isRicher(newVal: string | null, oldVal: unknown): boolean {
    if (!newVal) return false
    if (oldVal == null || oldVal === '') return true
    // If old value is shorter, new is richer
    return String(newVal).length > String(oldVal).length
  }

  // Always-set fields (new columns or strategic overrides)
  const alwaysSetFields: Array<keyof ReduxExtractedBoatData> = ['hin', 'boatClass', 'condition']

  for (const field of alwaysSetFields) {
    const val = extracted[field]
    if (val != null && val !== '') {
      patch[field] = val
    }
  }

  // Geo coordinates — always prefer Redux (YachtWorld's own data)
  if (extracted.geoLat != null && extracted.geoLng != null) {
    patch.geoLat = extracted.geoLat
    patch.geoLng = extracted.geoLng
    patch.geoProvider = 'yachtworld-redux'
    patch.geoPrecision = 'listing'
    patch.geoStatus = 'ok'
    patch.geoUpdatedAt = new Date().toISOString()
  }

  // Images — always replace (full-res vs thumbnails)
  if (extracted.images.length > 0) {
    // Preserve old images as sourceImages for traceability
    const existingImages = existing.images
    if (existingImages && String(existingImages).length > 2) {
      patch.sourceImages = existingImages
    }
    patch.images = JSON.stringify(extracted.images)
  }

  // "Overwrite if richer" fields
  const richFields: Array<{
    key: keyof ReduxExtractedBoatData
    dbKey?: string
  }> = [
    { key: 'contactName' },
    { key: 'contactPhone' },
    { key: 'contactInfo' },
    { key: 'description' },
    { key: 'sellerType' },
    { key: 'listingType' },
    { key: 'engineMake' },
    { key: 'engineModel' },
    { key: 'engineYearDetail' },
    { key: 'engineHours' },
    { key: 'engineTypeDetail' },
    { key: 'driveType' },
    { key: 'fuelTypeDetail' },
    { key: 'propellerType' },
    { key: 'propellerMaterial' },
    { key: 'propulsion' },
    { key: 'hullMaterial' },
    { key: 'keelType' },
    { key: 'cruisingSpeed' },
    { key: 'maxSpeed' },
    { key: 'range' },
    { key: 'lengthOverall' },
    { key: 'maxBridgeClearance' },
    { key: 'maxDraft' },
    { key: 'beamDetail' },
    { key: 'dryWeight' },
    { key: 'deadriseAtTransom' },
    { key: 'specifications' },
    { key: 'freshWaterTank' },
    { key: 'fuelTank' },
    { key: 'holdingTank' },
    { key: 'features' },
    { key: 'otherDetails' },
    { key: 'city' },
    { key: 'state' },
    { key: 'country' },
  ]

  for (const { key, dbKey } of richFields) {
    const newVal = extracted[key] as string | null
    const existingKey = dbKey || key
    if (isRicher(newVal, existing[existingKey])) {
      patch[existingKey] = newVal
    }
  }

  return patch
}

/**
 * Converts a camelCase key to snake_case for D1 column names.
 */
export function camelToSnake(key: string): string {
  return key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * Builds a SQL UPDATE SET clause from a patch object.
 * Returns the SET clause string and the parameter values array.
 */
export function buildUpdateSql(
  boatId: number,
  patch: Record<string, unknown>,
): { sql: string; params: unknown[] } | null {
  const entries = Object.entries(patch)
  if (entries.length === 0) return null

  const setClauses: string[] = []
  const params: unknown[] = []

  for (const [key, value] of entries) {
    setClauses.push(`${camelToSnake(key)} = ?`)
    params.push(value)
  }

  // Always update updated_at
  setClauses.push('updated_at = ?')
  params.push(new Date().toISOString())

  params.push(boatId)

  return {
    sql: `UPDATE boats SET ${setClauses.join(', ')} WHERE id = ?`,
    params,
  }
}
