import { and, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm'
import { requireAdmin } from '#layer/server/utils/auth'
import { boatDedupeCandidates, boatEntities, boats } from '~~/server/database/schema'

type BoatSummary = {
  id: number
  source: string
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  price: string | null
  city: string | null
  state: string | null
  updatedAt: string
  dedupeMethod: string | null
  dedupeConfidence: number | null
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useAppDatabase(event)

  const [listingSummaryRow] = await db
    .select({
      activeListings: sql<number>`SUM(CASE WHEN ${boats.supersededByBoatId} IS NULL THEN 1 ELSE 0 END)`,
      supersededListings: sql<number>`SUM(CASE WHEN ${boats.supersededByBoatId} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(boats)
    .all()

  const [entitySummaryRow] = await db
    .select({
      canonicalEntities: sql<number>`COUNT(*)`,
    })
    .from(boatEntities)
    .all()

  const [candidateSummaryRow] = await db
    .select({
      openCandidatePairs: sql<number>`COUNT(*)`,
    })
    .from(boatDedupeCandidates)
    .all()

  const multiListingRows = await db
    .select({
      entityId: boats.entityId,
      memberCount: sql<number>`COUNT(*)`,
    })
    .from(boats)
    .where(and(isNull(boats.supersededByBoatId), isNotNull(boats.entityId)))
    .groupBy(boats.entityId)
    .having(sql`COUNT(*) > 1`)
    .orderBy(sql`COUNT(*) DESC`)
    .all()

  const entityIds = multiListingRows
    .map((row) => row.entityId)
    .filter((value): value is number => value != null)

  const entityRows = entityIds.length
    ? await db
        .select({
          entityId: boatEntities.id,
          representativeBoatId: boatEntities.representativeBoatId,
          boatId: boats.id,
          source: boats.source,
          year: boats.year,
          make: boats.make,
          model: boats.model,
          length: boats.length,
          price: boats.price,
          city: boats.city,
          state: boats.state,
          updatedAt: boats.updatedAt,
          dedupeMethod: boats.dedupeMethod,
          dedupeConfidence: boats.dedupeConfidence,
        })
        .from(boatEntities)
        .innerJoin(
          boats,
          and(eq(boats.entityId, boatEntities.id), isNull(boats.supersededByBoatId)),
        )
        .where(inArray(boatEntities.id, entityIds))
        .orderBy(desc(boats.updatedAt), desc(boats.id))
        .all()
    : []

  const entities = entityIds
    .map((entityId) => {
      const rows = entityRows.filter((row) => row.entityId === entityId)
      return {
        entityId,
        representativeBoatId: rows[0]?.representativeBoatId ?? null,
        memberCount: rows.length,
        boats: rows.map(
          (row) =>
            ({
              id: row.boatId,
              source: row.source,
              year: row.year,
              make: row.make,
              model: row.model,
              length: row.length,
              price: row.price,
              city: row.city,
              state: row.state,
              updatedAt: row.updatedAt,
              dedupeMethod: row.dedupeMethod,
              dedupeConfidence: row.dedupeConfidence,
            }) satisfies BoatSummary,
        ),
      }
    })
    .slice(0, 12)

  const candidateRows = await db
    .select()
    .from(boatDedupeCandidates)
    .orderBy(desc(boatDedupeCandidates.confidenceScore), desc(boatDedupeCandidates.updatedAt))
    .limit(24)
    .all()

  const candidateBoatIds = [
    ...new Set(candidateRows.flatMap((row) => [row.leftBoatId, row.rightBoatId])),
  ]
  const candidateBoats = candidateBoatIds.length
    ? await db
        .select({
          id: boats.id,
          source: boats.source,
          year: boats.year,
          make: boats.make,
          model: boats.model,
          length: boats.length,
          price: boats.price,
          city: boats.city,
          state: boats.state,
          updatedAt: boats.updatedAt,
          dedupeMethod: boats.dedupeMethod,
          dedupeConfidence: boats.dedupeConfidence,
        })
        .from(boats)
        .where(inArray(boats.id, candidateBoatIds))
        .all()
    : []

  const boatById = new Map(
    candidateBoats.map((boat) => [
      boat.id,
      {
        id: boat.id,
        source: boat.source,
        year: boat.year,
        make: boat.make,
        model: boat.model,
        length: boat.length,
        price: boat.price,
        city: boat.city,
        state: boat.state,
        updatedAt: boat.updatedAt,
        dedupeMethod: boat.dedupeMethod,
        dedupeConfidence: boat.dedupeConfidence,
      } satisfies BoatSummary,
    ]),
  )

  return {
    summary: {
      activeListings: listingSummaryRow?.activeListings ?? 0,
      supersededListings: listingSummaryRow?.supersededListings ?? 0,
      canonicalEntities: entitySummaryRow?.canonicalEntities ?? 0,
      multiListingEntities: multiListingRows.length,
      openCandidatePairs: candidateSummaryRow?.openCandidatePairs ?? 0,
    },
    entities,
    candidates: candidateRows
      .map((row) => {
        const leftBoat = boatById.get(row.leftBoatId)
        const rightBoat = boatById.get(row.rightBoatId)
        if (!leftBoat || !rightBoat) return null

        return {
          id: row.id,
          confidenceScore: row.confidenceScore,
          ruleHits: JSON.parse(row.ruleHitsJson) as string[],
          updatedAt: row.updatedAt,
          leftBoat,
          rightBoat,
        }
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)),
  }
})
