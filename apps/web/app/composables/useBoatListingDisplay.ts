import { formatNormalizedBoatLocation } from '~~/lib/boatGeo'

export type SourceBadgeColor =
  | 'error'
  | 'info'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'neutral'

interface BoatTitleInput {
  year: number | null
  make: string | null
  model: string | null
}

interface BoatLocationInput {
  normalizedCity?: string | null
  normalizedState?: string | null
  normalizedCountry?: string | null
  city: string | null
  state: string | null
  location: string | null
}

export function useBoatListingDisplay() {
  function formatPrice(price: number | null) {
    if (!price) return 'Price on request'
    return `$${price.toLocaleString()}`
  }

  function formatLength(length: string | null) {
    if (!length) return 'Length unlisted'
    const t = length.trim()
    // Avoid "34ft ft": values like "34ft" have no \b before "ft" (digit is a word char).
    if (/\bft\b|'|′|feet\b/i.test(t) || /\d\s*ft\.?\b/i.test(t) || /\dft\b/i.test(t)) return t
    return `${t} ft`
  }

  function formatLocation(location: BoatLocationInput) {
    return formatNormalizedBoatLocation(location)
  }

  function formatListingTitle(boat: BoatTitleInput) {
    return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Boat listing'
  }

  function getSourceColor(source: string): SourceBadgeColor {
    switch (source) {
      case 'boats.com':
        return 'info'
      case 'yachtworld.com':
        return 'primary'
      case 'boattrader.com':
        return 'success'
      case 'thehulltruth.com':
        return 'warning'
      default:
        return 'neutral'
    }
  }

  function getSourceLabel(source: string) {
    switch (source) {
      case 'boats.com':
        return 'Boats.com'
      case 'yachtworld.com':
        return 'YachtWorld'
      case 'boattrader.com':
        return 'BoatTrader'
      case 'thehulltruth.com':
        return 'Hull Truth'
      default:
        return source
    }
  }

  function getSourceCta(source: string) {
    switch (source) {
      case 'boats.com':
        return 'Open on Boats.com'
      case 'yachtworld.com':
        return 'Open on YachtWorld'
      case 'boattrader.com':
        return 'Open on BoatTrader'
      case 'thehulltruth.com':
        return 'Open on Hull Truth'
      default:
        return 'Open source listing'
    }
  }

  function getSourceNote(source: string) {
    switch (source) {
      case 'boats.com':
        return 'Broker-backed marketplace listing with pricing and media pulled from Boats.com.'
      case 'yachtworld.com':
        return 'Premium yacht brokerage inventory syndicated from YachtWorld.'
      case 'boattrader.com':
        return 'Marketplace inventory sourced from BoatTrader listings and dealer feeds.'
      case 'thehulltruth.com':
        return 'Community marketplace listing from the Hull Truth classifieds.'
      default:
        return 'Original listing hosted on the upstream marketplace.'
    }
  }

  return {
    formatPrice,
    formatLength,
    formatLocation,
    formatListingTitle,
    getSourceColor,
    getSourceLabel,
    getSourceCta,
    getSourceNote,
  }
}
