import { eq } from 'drizzle-orm'
import { notifications, savedSearches } from '~~/server/database/schema'
import { defineCronMutation } from '#layer/server/utils/mutation'
import { boatSearchFilterSchema, selectBoatsWithFilters } from '~~/server/utils/boatFilterQuery'

/**
 * Match new/updated boats against saved searches and create in-app notifications.
 * Schedule via Cloudflare Cron Triggers + Authorization: Bearer CRON_SECRET.
 */
export default defineCronMutation(
  {
    rateLimit: { namespace: 'cron-saved-search', maxRequests: 5, windowMs: 60_000 },
  },
  async ({ event }) => {
    const db = useAppDatabase(event)
    const rows = await db.select().from(savedSearches).where(eq(savedSearches.paused, false)).all()

    const now = new Date().toISOString()
    let notificationsCreated = 0

    for (const search of rows) {
      let parsedFilter: ReturnType<typeof boatSearchFilterSchema.safeParse>
      try {
        parsedFilter = boatSearchFilterSchema.safeParse(JSON.parse(search.filterJson))
      } catch {
        continue
      }
      if (!parsedFilter.success) continue

      if (!search.lastNotifiedAt) {
        await db
          .update(savedSearches)
          .set({ lastNotifiedAt: now, updatedAt: now })
          .where(eq(savedSearches.id, search.id))
          .run()
        continue
      }

      const matches = await selectBoatsWithFilters(db, parsedFilter.data, {
        limit: 100,
        updatedAfter: search.lastNotifiedAt,
      })

      for (const boat of matches) {
        const title = `New match: ${search.name}`
        const body =
          `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Boat listing'
        await db
          .insert(notifications)
          .values({
            id: crypto.randomUUID(),
            userId: search.userId,
            kind: 'alert',
            title,
            body,
            icon: 'i-lucide-bell',
            actionUrl: `/boats/${boat.id}`,
            resourceType: 'saved_search',
            resourceId: String(search.id),
            isRead: false,
            createdAt: now,
          })
          .run()
        notificationsCreated += 1
      }

      await db
        .update(savedSearches)
        .set({ lastNotifiedAt: now, updatedAt: now })
        .where(eq(savedSearches.id, search.id))
        .run()
    }

    return { ok: true, savedSearchesScanned: rows.length, notificationsCreated }
  },
)
