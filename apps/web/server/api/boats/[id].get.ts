import { boats } from '~~/server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') || '', 10)

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid boat ID' })
  }

  const db = useAppDatabase(event)
  const result = await db.select().from(boats).where(eq(boats.id, id)).limit(1)

  if (result.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Boat not found' })
  }

  const boat = result[0]!
  return {
    ...boat,
    images: boat.images ? JSON.parse(boat.images) : [],
    price: boat.price ? Number.parseInt(boat.price, 10) : null,
  }
})
