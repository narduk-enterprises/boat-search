/**
 * App-hosted boat listing images are stored as URLs whose path starts with `/images/`
 * and map 1:1 to R2 object keys (path segment after `/images/`).
 */

const IMAGES_PATH_PREFIX = '/images/'

export function parseBoatImagesJson(imagesJson: string | null): string[] {
  if (!imagesJson) return []

  try {
    const parsed = JSON.parse(imagesJson) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

export function isAppHostedBoatImageUrl(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false

  try {
    const url = normalized.startsWith('/')
      ? new URL(normalized, 'https://boat-search.local')
      : new URL(normalized)
    return url.pathname.startsWith(IMAGES_PATH_PREFIX)
  } catch {
    return false
  }
}

/** R2 object key for HeadObject / Worker `r2.get(key)`, or null if not an app-hosted image URL. */
export function r2KeyFromBoatImageUrl(value: string): string | null {
  if (!isAppHostedBoatImageUrl(value)) return null

  try {
    const normalized = value.trim()
    const url = normalized.startsWith('/')
      ? new URL(normalized, 'https://boat-search.local')
      : new URL(normalized)
    if (!url.pathname.startsWith(IMAGES_PATH_PREFIX)) return null
    const key = decodeURIComponent(url.pathname.slice(IMAGES_PATH_PREFIX.length).replace(/^\/+/, ''))
    return key.length > 0 ? key : null
  } catch {
    return null
  }
}

export function collectR2KeysFromBoatImagesJson(imagesJson: string | null): string[] {
  const keys = new Set<string>()
  for (const raw of parseBoatImagesJson(imagesJson)) {
    const key = r2KeyFromBoatImageUrl(raw)
    if (key) keys.add(key)
  }
  return [...keys]
}
