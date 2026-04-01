const SCRAPER_DETAIL_ARTIFACT_PREFIX = 'artifacts/detail-pages'

function sanitizeArtifactPathSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

  return normalized || 'unknown'
}

function normalizeArtifactTimestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value) : new Date()
  const iso = Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()

  return iso.replaceAll(/[^0-9TZ]/g, '')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildBoatDetailArtifactKeys(input: {
  source: string
  listingId?: string | null
  url?: string | null
  capturedAt?: string | null
}) {
  const sourceSegment = sanitizeArtifactPathSegment(input.source)
  const listingId = input.listingId?.trim() || ''
  const url = input.url?.trim() || ''
  const identityHash = await sha256Hex(`${input.source}::${listingId}::${url}`)
  const identitySegment = listingId
    ? `listing-${sanitizeArtifactPathSegment(listingId)}-${identityHash.slice(0, 12)}`
    : `url-${identityHash.slice(0, 12)}`
  const prefix = `${SCRAPER_DETAIL_ARTIFACT_PREFIX}/${sourceSegment}/${identitySegment}`
  const capturedAt = normalizeArtifactTimestamp(input.capturedAt)

  return {
    capturedAt,
    prefix,
    latestKey: `${prefix}/latest.json`,
    versionKey: `${prefix}/${capturedAt}.json`,
  }
}
