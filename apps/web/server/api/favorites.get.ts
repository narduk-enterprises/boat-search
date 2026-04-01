import { desc, eq } from 'drizzle-orm'
import { boatFavorites, boats } from '~~/server/database/schema'
import { requireAuth } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const db = useAppDatabase(event)
  const rows = await db
    .select({
      boatId: boatFavorites.boatId,
      createdAt: boatFavorites.createdAt,
      joinedId: boats.id,
      year: boats.year,
      make: boats.make,
      model: boats.model,
      length: boats.length,
      price: boats.price,
      city: boats.city,
      state: boats.state,
      location: boats.location,
      source: boats.source,
      description: boats.description,
      sellerType: boats.sellerType,
      imagesJson: boats.images,
    })
    .from(boatFavorites)
    .leftJoin(boats, eq(boatFavorites.boatId, boats.id))
    .where(eq(boatFavorites.userId, user.id))
    .orderBy(desc(boatFavorites.createdAt))
    .all()

  return {
    favorites: rows.map((r) => ({
      boatId: r.boatId,
      createdAt: r.createdAt,
      boat:
        r.joinedId != null
          ? {
              id: r.joinedId,
              year: r.year,
              make: r.make,
              model: r.model,
              length: r.length,
              price: r.price ? Number.parseInt(r.price, 10) : null,
              city: r.city,
              state: r.state,
              location: r.location,
              source: r.source,
              description: r.description,
              sellerType: r.sellerType,
              images: safeParseImages(r.imagesJson),
            }
          : null,
    })),
  }
})

function safeParseImages(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}
