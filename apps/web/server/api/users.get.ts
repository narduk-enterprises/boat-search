import { users } from '#layer/server/database/schema'
import { requireAdmin } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useAppDatabase(event)
  // Ensure the users table is accessible, verifying D1 and schema
  return await db.select().from(users).limit(5)
})
