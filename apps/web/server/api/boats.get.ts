import { z } from 'zod'
import { boatSearchFilterSchema, selectBoatsWithFilters } from '~~/server/utils/boatFilterQuery'
import { hydrateBoatRow } from '~~/server/utils/boatInventory'

const querySchema = boatSearchFilterSchema.extend({
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const db = useAppDatabase(event)
  const query = querySchema.parse(getQuery(event))
  const { limit, offset, ...filter } = query

  const results = await selectBoatsWithFilters(db, filter, { limit, offset })
  const cleaned = results.map((boat) => hydrateBoatRow(boat))

  const seen = new Set<string>()
  return cleaned.filter((boat: (typeof cleaned)[number]) => {
    const key = `${boat.make || ''}-${boat.model || ''}-${boat.year || ''}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})
