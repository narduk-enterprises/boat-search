export type SourceBadgeColor =
  | 'error'
  | 'info'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'neutral'

export function useBoatListingDisplay() {
  function formatPrice(price: number | null) {
    if (!price) return 'Price N/A'
    return `$${price.toLocaleString()}`
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

  return { formatPrice, getSourceColor, getSourceLabel }
}
