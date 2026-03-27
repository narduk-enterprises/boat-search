import { eq } from 'drizzle-orm'
import { buyerProfiles } from '~~/server/database/schema'
import { requireAuth } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useAppDatabase(event)
  const row = await db.select().from(buyerProfiles).where(eq(buyerProfiles.userId, user.id)).get()
  if (!row) {
    return { profile: {} as Record<string, unknown> }
  }
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(row.dataJson) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  return { profile: parsed, updatedAt: row.updatedAt }
})
