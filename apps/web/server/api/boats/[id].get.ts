import { selectInventoryBoat } from '~~/server/utils/boatInventory'

export default defineEventHandler(async (event) => {
  const id = Number.parseInt(getRouterParam(event, 'id') || '', 10)

  if (Number.isNaN(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid boat ID' })
  }

  const db = useAppDatabase(event)
  const result = await selectInventoryBoat(db, id)
  if (!result) {
    throw createError({ statusCode: 404, statusMessage: 'Boat not found' })
  }
  return result
})
