import type { BoatBrowseLink } from '~~/app/types/boat-inventory'

export const BOAT_INVENTORY_SEARCH_PATH = '/boats-for-sale'

export const inventoryBudgetLinks: BoatBrowseLink[] = [
  {
    label: 'Under $25k',
    description: 'Starter skiffs, utility rigs, and project-friendly weekend boats.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { maxPrice: '25000' } },
    icon: 'i-lucide-wallet',
    chips: ['Max $25k'],
  },
  {
    label: 'Under $50k',
    description: 'Roomier used center consoles, pontoons, and freshwater cruisers.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { maxPrice: '50000' } },
    icon: 'i-lucide-banknote',
    chips: ['Max $50k'],
  },
  {
    label: 'Under $100k',
    description: 'Higher-spec offshore, bay, and express options without premium-new pricing.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { maxPrice: '100000' } },
    icon: 'i-lucide-badge-dollar-sign',
    chips: ['Max $100k'],
  },
  {
    label: 'Under $250k',
    description: 'Larger convertible, sportfish, and cruising inventory for serious buyers.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { maxPrice: '250000' } },
    icon: 'i-lucide-briefcase-business',
    chips: ['Max $250k'],
  },
]

export const inventoryLocationLinks: BoatBrowseLink[] = [
  {
    label: 'Florida',
    description: 'Dense saltwater inventory and year-round listing volume.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { location: 'FL' } },
    icon: 'i-lucide-map-pinned',
    chips: ['Location: FL'],
  },
  {
    label: 'Texas',
    description: 'Gulf coast center consoles, bay boats, and offshore-ready hulls.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { location: 'TX' } },
    icon: 'i-lucide-map-pinned',
    chips: ['Location: TX'],
  },
  {
    label: 'California',
    description: 'West coast fishing and cruising supply with long-haul options.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { location: 'CA' } },
    icon: 'i-lucide-map-pinned',
    chips: ['Location: CA'],
  },
  {
    label: 'Great Lakes',
    description: 'Freshwater listings centered around MI, WI, IL, and surrounding states.',
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { location: 'MI' } },
    icon: 'i-lucide-map-pinned',
    chips: ['Location: MI'],
  },
]

export const inventoryTypeLinks: BoatBrowseLink[] = [
  {
    label: 'Center console',
    description: 'Versatile fishing layouts with easy deck circulation and open cockpit space.',
    to: '/boats-for-sale/type/center-console',
    icon: 'i-lucide-ship-wheel',
  },
  {
    label: 'Pontoon',
    description: 'Entertain, cruise, and fish in shallow water with wide deck plans.',
    to: '/boats-for-sale/type/pontoon',
    icon: 'i-lucide-ship-wheel',
  },
  {
    label: 'Bowrider',
    description: 'Fast lake-day layouts for families, tow sports, and short-range cruising.',
    to: '/boats-for-sale/type/bowrider',
    icon: 'i-lucide-ship-wheel',
  },
  {
    label: 'Cabin cruiser',
    description: 'Weather protection and overnight comfort for longer weekends afloat.',
    to: '/boats-for-sale/type/cabin-cruiser',
    icon: 'i-lucide-ship-wheel',
  },
]

export const inventoryUseCaseLinks: BoatBrowseLink[] = [
  {
    label: 'Offshore fishing',
    description: 'Jump into guides and shortlist logic for bluewater and canyon trips.',
    to: '/best/offshore-fishing',
    icon: 'i-lucide-fish',
  },
  {
    label: 'Family weekends',
    description: 'Balance seating, overnight comfort, and fuel burn for casual escapes.',
    to: '/best/family-weekends',
    icon: 'i-lucide-tent-tree',
  },
  {
    label: 'Lake days',
    description: 'Lower-draft and lower-maintenance options for inland boating patterns.',
    to: '/best/lake-days',
    icon: 'i-lucide-waves',
  },
  {
    label: 'Liveaboard',
    description: 'Browse bigger cabins, storage, and systems for extended time on board.',
    to: '/best/liveaboard',
    icon: 'i-lucide-house',
  },
]

export function makeInventorySearchLink(make: string): BoatBrowseLink {
  return {
    label: make,
    description: `Open the live inventory with ${make} prefilled as a make filter.`,
    to: { path: BOAT_INVENTORY_SEARCH_PATH, query: { make } },
    icon: 'i-lucide-anchor',
    chips: [`Make: ${make}`],
  }
}
