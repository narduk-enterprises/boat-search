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
    return /\bft\b|'/i.test(length) ? length : `${length} ft`
  }

  function formatLocation(location: BoatLocationInput) {
    const cityState = [location.city, location.state].filter(Boolean).join(', ')
    return cityState || location.location || 'Location unlisted'
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
