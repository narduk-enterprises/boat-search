import { desc, sql } from 'drizzle-orm'
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

  const sourceRows = await db
    .select({
      source: boats.source,
      count: sql<number>`COUNT(*)`,
      latestUpdatedAt: sql<string | null>`MAX(${boats.updatedAt})`,
    })
    .from(boats)
    .groupBy(boats.source)

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
      }))
      .sort((left, right) => right.count - left.count),
    recentCrawls,
  }
})
