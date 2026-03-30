import type { BrowserScrapeRecord, ExtensionKnownBoatIdentities } from '@/shared/types'

export type BrowserRunIdentityState = {
  knownListingIds: Set<string>
  knownNormalizedUrls: Set<string>
  refreshableListingIds: Set<string>
  refreshableNormalizedUrls: Set<string>
}

function normalizeListingId(value: string | null | undefined) {
  return value?.trim() || ''
}

export function normalizeBoatSourceUrl(value: string | null | undefined) {
  if (!value) return ''

  try {
    const url = new URL(value)
    url.hash = ''
    url.search = ''
    url.hostname = url.hostname.toLowerCase()
    const pathname = url.pathname.replace(/\/+$/g, '')
    return `${url.protocol}//${url.hostname}${pathname || '/'}`
  } catch {
    return value.replaceAll(/\s+/g, ' ').trim()
  }
}

export function createBrowserRunIdentityState(
  existingBoatIdentities: ExtensionKnownBoatIdentities | null | undefined,
  refreshableBoatIdentities: ExtensionKnownBoatIdentities | null | undefined = null,
): BrowserRunIdentityState {
  return {
    knownListingIds: new Set(
      (existingBoatIdentities?.listingIds || [])
        .map((listingId) => normalizeListingId(listingId))
        .filter(Boolean),
    ),
    knownNormalizedUrls: new Set(
      (existingBoatIdentities?.normalizedUrls || [])
        .map((url) => normalizeBoatSourceUrl(url))
        .filter(Boolean),
    ),
    refreshableListingIds: new Set(
      (refreshableBoatIdentities?.listingIds || [])
        .map((listingId) => normalizeListingId(listingId))
        .filter(Boolean),
    ),
    refreshableNormalizedUrls: new Set(
      (refreshableBoatIdentities?.normalizedUrls || [])
        .map((url) => normalizeBoatSourceUrl(url))
        .filter(Boolean),
    ),
  }
}

export function hasKnownBoatIdentity(
  state: BrowserRunIdentityState,
  record: Pick<BrowserScrapeRecord, 'listingId' | 'url'>,
) {
  const listingId = normalizeListingId(record.listingId)
  if (listingId && state.knownListingIds.has(listingId)) {
    return true
  }

  const normalizedUrl = normalizeBoatSourceUrl(record.url)
  return Boolean(normalizedUrl && state.knownNormalizedUrls.has(normalizedUrl))
}

export function consumeRefreshableBoatIdentity(
  state: BrowserRunIdentityState,
  record: Pick<BrowserScrapeRecord, 'listingId' | 'url'>,
) {
  const listingId = normalizeListingId(record.listingId)
  const normalizedUrl = normalizeBoatSourceUrl(record.url)
  const matchedByListingId = listingId ? state.refreshableListingIds.delete(listingId) : false
  const matchedByUrl = normalizedUrl
    ? state.refreshableNormalizedUrls.delete(normalizedUrl)
    : false

  return matchedByListingId || matchedByUrl
}

export function rememberBoatIdentity(
  state: BrowserRunIdentityState,
  record: Pick<BrowserScrapeRecord, 'listingId' | 'url'>,
) {
  const listingId = normalizeListingId(record.listingId)
  if (listingId) {
    state.knownListingIds.add(listingId)
  }

  const normalizedUrl = normalizeBoatSourceUrl(record.url)
  if (normalizedUrl) {
    state.knownNormalizedUrls.add(normalizedUrl)
  }
}
