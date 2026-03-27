import { z } from 'zod'
import { boatSearchFilterSchema, selectBoatsWithFilters } from '~~/server/utils/boatFilterQuery'

const querySchema = boatSearchFilterSchema.extend({
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const db = useAppDatabase(event)
  const query = querySchema.parse(getQuery(event))
  const { limit, offset, ...filter } = query

  const results = await selectBoatsWithFilters(db, filter, { limit, offset })

  const cleaned = results.map((boat: (typeof results)[number]) => ({
    ...boat,
    images: boat.images ? JSON.parse(boat.images) : [],
    price: boat.price ? Number.parseInt(boat.price, 10) : null,
    description: cleanDescription(boat.description),
  }))

  const seen = new Set<string>()
  return cleaned.filter((boat: (typeof cleaned)[number]) => {
    const key = `${boat.make || ''}-${boat.model || ''}-${boat.year || ''}`.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

function cleanDescription(raw: string | null): string | null {
  if (!raw) return null

  let text = raw
    .replace(/First\s*(?:&\s*)?Last\s*Name[\s\S]*/i, '')
    .replaceAll(/EmailPhoneSubjectComments[\s\S]*/gi, '')
    .replaceAll(/Please contact [\s\S]*/gi, '')
    .replaceAll(/Contact Information[\s\S]*/gi, '')
    .replaceAll(/I'd like to know if the[\s\S]*/gi, '')
    .replaceAll(/Show\s*More[\s\S]*/gi, '')
    .replaceAll(/Trusted\s*Partner\s*\|[\s\S]*/gi, '')
    .replaceAll(/\n{3,}/g, '\n\n')
    .replaceAll(/\s{2,}/g, ' ')
    .trim()

  if (text.length < 10) return null
  if (text.length > 2000) text = text.slice(0, 2000) + '...'

  return text
}
