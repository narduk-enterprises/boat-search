import { desc, eq } from 'drizzle-orm'
import { savedSearches } from '~~/server/database/schema'
import { requireAuth } from '#layer/server/utils/auth'
import { boatSearchFilterSchema } from '~~/server/utils/boatFilterQuery'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useAppDatabase(event)
  const rows = await db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, user.id))
    .orderBy(desc(savedSearches.createdAt))
    .all()

  return {
    savedSearches: rows.map((r) => ({
      id: r.id,
      name: r.name,
      filter: safeParseFilter(r.filterJson),
      frequency: r.frequency,
      paused: r.paused,
      lastNotifiedAt: r.lastNotifiedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  }
})

function safeParseFilter(json: string) {
  try {
    const raw = JSON.parse(json) as unknown
    const parsed = boatSearchFilterSchema.safeParse(raw)
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}
