import { z } from 'zod'
import {
  boatSearchFilterSchema,
  countBoatsWithFilters,
  selectBoatsWithFilters,
} from '~~/server/utils/boatFilterQuery'
import { hydrateBoatRow } from '~~/server/utils/boatInventory'

const inventorySortSchema = z.enum(['updated-desc', 'price-asc', 'price-desc', 'year-desc'])

const querySchema = boatSearchFilterSchema.extend({
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
  sort: inventorySortSchema.default('updated-desc'),
  geoMode: z.enum(['all', 'matched']).default('all'),
})

export default defineEventHandler(async (event) => {
  const db = useAppDatabase(event)
  const query = querySchema.parse(getQuery(event))
  const { limit, offset, sort, geoMode, ...filter } = query

  const [results, total] = await Promise.all([
    selectBoatsWithFilters(db, filter, { limit, offset, sort, matchedOnly: geoMode === 'matched' }),
    countBoatsWithFilters(db, filter, { matchedOnly: geoMode === 'matched' }),
  ])

  const items = results.map((boat) => hydrateBoatRow(boat))
  return {
    items,
    total,
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    hasNextPage: offset + items.length < total,
    hasPreviousPage: offset > 0,
    sort,
  }
})
