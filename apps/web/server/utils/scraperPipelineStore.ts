import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import {
  scraperPipelineDraftSchema,
  type ScraperJobSummary,
  type ScraperPipelineDraft,
  type ScraperPipelineRecord,
  type ScraperRunSummary,
} from '~~/lib/scraperPipeline'
import { crawlJobs, scraperPipelines } from '#server/database/schema'
import { useAppDatabase } from '#server/utils/database'

type PipelineRow = typeof scraperPipelines.$inferSelect
type CrawlJobRow = typeof crawlJobs.$inferSelect

function parsePipelineConfig(configJson: string) {
  return scraperPipelineDraftSchema.shape.config.parse(JSON.parse(configJson))
}

function parseJobSummary(resultJson: string | null): ScraperRunSummary | null {
  if (!resultJson) return null

  try {
    return JSON.parse(resultJson) as ScraperRunSummary
  } catch {
    return null
  }
}

function toJobSummary(job: CrawlJobRow): ScraperJobSummary {
  return {
    id: job.id,
    status: job.status,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    boatsFound: job.boatsFound,
    boatsScraped: job.boatsScraped,
    pagesVisited: job.pagesVisited,
    error: job.error,
    summary: parseJobSummary(job.resultJson),
  }
}

function toPipelineRecord(row: PipelineRow, lastJob: CrawlJobRow | null): ScraperPipelineRecord {
  return {
    id: row.id,
    name: row.name,
    boatSource: row.boatSource,
    description: row.description || '',
    active: row.active,
    config: parsePipelineConfig(row.configJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastRunAt: row.lastRunAt,
    lastJob: lastJob ? toJobSummary(lastJob) : null,
  }
}

export async function listScraperPipelines(event: H3Event) {
  const db = useAppDatabase(event)
  const rows = await db
    .select()
    .from(scraperPipelines)
    .orderBy(desc(scraperPipelines.updatedAt), desc(scraperPipelines.id))

  const pipelineIds = rows.map((row) => row.id)
  const recentJobs = pipelineIds.length
    ? await db
        .select()
        .from(crawlJobs)
        .where(and(isNotNull(crawlJobs.pipelineId), inArray(crawlJobs.pipelineId, pipelineIds)))
        .orderBy(desc(crawlJobs.startedAt), desc(crawlJobs.id))
    : []

  const lastJobByPipelineId = new Map<number, CrawlJobRow>()
  for (const job of recentJobs) {
    if (job.pipelineId == null || lastJobByPipelineId.has(job.pipelineId)) continue
    lastJobByPipelineId.set(job.pipelineId, job)
  }

  return rows.map((row) => toPipelineRecord(row, lastJobByPipelineId.get(row.id) ?? null))
}

export async function getScraperPipeline(event: H3Event, pipelineId: number) {
  const db = useAppDatabase(event)
  const row = await db
    .select()
    .from(scraperPipelines)
    .where(eq(scraperPipelines.id, pipelineId))
    .limit(1)
    .get()

  if (!row) return null

  const lastJob = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.pipelineId, pipelineId))
    .orderBy(desc(crawlJobs.startedAt), desc(crawlJobs.id))
    .limit(1)
    .get()

  return toPipelineRecord(row, lastJob ?? null)
}

export async function findScraperPipelineByIdentity(
  event: H3Event,
  name: string,
  boatSource: string,
) {
  const db = useAppDatabase(event)
  const row = await db
    .select()
    .from(scraperPipelines)
    .where(and(eq(scraperPipelines.name, name), eq(scraperPipelines.boatSource, boatSource)))
    .orderBy(desc(scraperPipelines.updatedAt), desc(scraperPipelines.id))
    .limit(1)
    .get()

  if (!row) return null

  const lastJob = await db
    .select()
    .from(crawlJobs)
    .where(eq(crawlJobs.pipelineId, row.id))
    .orderBy(desc(crawlJobs.startedAt), desc(crawlJobs.id))
    .limit(1)
    .get()

  return toPipelineRecord(row, lastJob ?? null)
}

export async function createScraperPipeline(event: H3Event, draft: ScraperPipelineDraft) {
  const db = useAppDatabase(event)
  const parsed = scraperPipelineDraftSchema.parse(draft)
  const now = new Date().toISOString()

  await db
    .insert(scraperPipelines)
    .values({
      name: parsed.name,
      boatSource: parsed.boatSource,
      description: parsed.description,
      active: parsed.active,
      configJson: JSON.stringify(parsed.config),
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
    })
    .run()

  const created = await db
    .select()
    .from(scraperPipelines)
    .where(eq(scraperPipelines.createdAt, now))
    .orderBy(desc(scraperPipelines.id))
    .limit(1)
    .get()

  if (!created) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not load the newly created pipeline.',
    })
  }

  return toPipelineRecord(created, null)
}

export async function updateScraperPipeline(
  event: H3Event,
  pipelineId: number,
  draft: ScraperPipelineDraft,
) {
  const db = useAppDatabase(event)
  const parsed = scraperPipelineDraftSchema.parse(draft)
  const now = new Date().toISOString()

  await db
    .update(scraperPipelines)
    .set({
      name: parsed.name,
      boatSource: parsed.boatSource,
      description: parsed.description,
      active: parsed.active,
      configJson: JSON.stringify(parsed.config),
      updatedAt: now,
    })
    .where(eq(scraperPipelines.id, pipelineId))
    .run()

  const updated = await getScraperPipeline(event, pipelineId)
  if (!updated) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Pipeline not found after update.',
    })
  }

  return updated
}

export async function markScraperPipelineRun(event: H3Event, pipelineId: number, at: string) {
  const db = useAppDatabase(event)
  await db
    .update(scraperPipelines)
    .set({
      lastRunAt: at,
      updatedAt: at,
    })
    .where(eq(scraperPipelines.id, pipelineId))
    .run()
}
