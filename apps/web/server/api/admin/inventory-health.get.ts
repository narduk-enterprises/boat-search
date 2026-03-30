import { desc, isNull, sql } from 'drizzle-orm'
import { requireAdmin } from '#layer/server/utils/auth'
import { boats, crawlJobs } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useAppDatabase(event)
  const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [overviewRow] = await db
    .select({
      totalBoats: sql<number>`COUNT(*)`,
      staleBoats: sql<number>`SUM(CASE WHEN ${boats.updatedAt} < ${staleThreshold} THEN 1 ELSE 0 END)`,
      lastUpdatedAt: sql<string | null>`MAX(${boats.updatedAt})`,
      lastScrapedAt: sql<string | null>`MAX(${boats.scrapedAt})`,
    })
    .from(boats)
    .where(isNull(boats.supersededByBoatId))

  const sourceRows = await db
    .select({
      source: boats.source,
      count: sql<number>`COUNT(*)`,
      latestUpdatedAt: sql<string | null>`MAX(${boats.updatedAt})`,
      mapReadyBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'matched' THEN 1 ELSE 0 END)`,
      pendingBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'pending' THEN 1 ELSE 0 END)`,
      ambiguousBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'ambiguous' THEN 1 ELSE 0 END)`,
      skippedBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'skipped' THEN 1 ELSE 0 END)`,
      failedBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'failed' THEN 1 ELSE 0 END)`,
    })
    .from(boats)
    .where(isNull(boats.supersededByBoatId))
    .groupBy(boats.source)

  const [geoCoverageRow] = await db
    .select({
      mapReadyBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'matched' THEN 1 ELSE 0 END)`,
      pendingBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'pending' THEN 1 ELSE 0 END)`,
      ambiguousBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'ambiguous' THEN 1 ELSE 0 END)`,
      skippedBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'skipped' THEN 1 ELSE 0 END)`,
      failedBoats: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'failed' THEN 1 ELSE 0 END)`,
      lastGeocodedAt: sql<string | null>`MAX(${boats.geoUpdatedAt})`,
    })
    .from(boats)
    .where(isNull(boats.supersededByBoatId))

  const [pipeIssueRow, stateIssueRow, prefixedCityIssueRow, skippedIssueRow] = await Promise.all([
    db
      .select({
        count: sql<number>`SUM(CASE WHEN ${boats.city} LIKE '%|%' THEN 1 ELSE 0 END)`,
      })
      .from(boats)
      .where(isNull(boats.supersededByBoatId))
      .get(),
    db
      .select({
        count: sql<number>`SUM(CASE WHEN ${boats.state} = 'United States' THEN 1 ELSE 0 END)`,
      })
      .from(boats)
      .where(isNull(boats.supersededByBoatId))
      .get(),
    db
      .select({
        count: sql<number>`SUM(CASE WHEN ${boats.city} GLOB '[0-9]*ft*' THEN 1 ELSE 0 END)`,
      })
      .from(boats)
      .where(isNull(boats.supersededByBoatId))
      .get(),
    db
      .select({
        count: sql<number>`SUM(CASE WHEN ${boats.geoStatus} = 'skipped' THEN 1 ELSE 0 END)`,
      })
      .from(boats)
      .where(isNull(boats.supersededByBoatId))
      .get(),
  ])

  const normalizationIssues = [
    { issue: 'city_pipe_suffix_used', count: pipeIssueRow?.count ?? 0 },
    { issue: 'state_was_country', count: stateIssueRow?.count ?? 0 },
    { issue: 'city_length_prefixed', count: prefixedCityIssueRow?.count ?? 0 },
    { issue: 'missing_city_or_state_after_normalization', count: skippedIssueRow?.count ?? 0 },
  ]
    .filter((issue) => issue.count > 0)
    .sort((left, right) => right.count - left.count)

  const recentCrawls = await db
    .select({
      id: crawlJobs.id,
      searchUrl: crawlJobs.searchUrl,
      status: crawlJobs.status,
      boatsFound: crawlJobs.boatsFound,
      boatsScraped: crawlJobs.boatsScraped,
      startedAt: crawlJobs.startedAt,
      completedAt: crawlJobs.completedAt,
      error: crawlJobs.error,
    })
    .from(crawlJobs)
    .orderBy(desc(crawlJobs.startedAt))
    .limit(10)

  const failedCrawls = recentCrawls.filter((crawl) => crawl.status !== 'completed').length
  const partialCrawls = recentCrawls.filter(
    (crawl) =>
      crawl.status === 'completed' &&
      typeof crawl.boatsFound === 'number' &&
      typeof crawl.boatsScraped === 'number' &&
      crawl.boatsScraped < crawl.boatsFound,
  ).length

  return {
    overview: {
      totalBoats: overviewRow?.totalBoats ?? 0,
      staleBoats: overviewRow?.staleBoats ?? 0,
      freshBoats: Math.max(0, (overviewRow?.totalBoats ?? 0) - (overviewRow?.staleBoats ?? 0)),
      failedCrawls,
      partialCrawls,
      lastUpdatedAt: overviewRow?.lastUpdatedAt ?? null,
      lastScrapedAt: overviewRow?.lastScrapedAt ?? null,
    },
    sources: sourceRows
      .map((source) => ({
        source: source.source,
        count: source.count,
        latestUpdatedAt: source.latestUpdatedAt,
        mapReadyBoats: source.mapReadyBoats,
        pendingBoats: source.pendingBoats,
        ambiguousBoats: source.ambiguousBoats,
        skippedBoats: source.skippedBoats,
        failedBoats: source.failedBoats,
      }))
      .sort((left, right) => right.count - left.count),
    geoCoverage: {
      mapReadyBoats: geoCoverageRow?.mapReadyBoats ?? 0,
      pendingBoats: geoCoverageRow?.pendingBoats ?? 0,
      ambiguousBoats: geoCoverageRow?.ambiguousBoats ?? 0,
      skippedBoats: geoCoverageRow?.skippedBoats ?? 0,
      failedBoats: geoCoverageRow?.failedBoats ?? 0,
      lastGeocodedAt: geoCoverageRow?.lastGeocodedAt ?? null,
      normalizationIssues,
    },
    recentCrawls,
  }
})
