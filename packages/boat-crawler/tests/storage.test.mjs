import assert from 'assert/strict'
import { mkdtempSync } from 'fs'
import test from 'node:test'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureCrawlerSchema, openCrawlerDatabase, TelemetryRecorder } from '../src/storage.mjs'

test('telemetry recorder stores job, events, attempts, and artifacts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'boat-crawler-storage-'))
  const env = {
    BOAT_CRAWLER_DATA_DIR: dir,
    BOAT_CRAWLER_DB_PATH: join(dir, 'boats.db'),
  }
  const { db } = openCrawlerDatabase(env)
  ensureCrawlerSchema(db)

  const telemetry = new TelemetryRecorder({
    db,
    dataDir: dir,
    sourceKey: 'boats-com',
    parserVersion: 'test-version',
    fallbackStrategy: 'manual-import',
  })

  const jobId = telemetry.startJob({ searchUrl: 'https://www.boats.com/boats-for-sale/' })
  const attemptId = telemetry.recordAttemptStart({
    url: 'https://www.boats.com/boats-for-sale/',
    pageKind: 'search',
  })

  telemetry.recordEvent({
    attemptId,
    url: 'https://www.boats.com/boats-for-sale/',
    stage: 'search',
    level: 'warning',
    eventType: 'challenge_or_block',
    message: 'Blocked during classifier test',
    metadata: { pageState: 'challenge_or_block' },
  })

  const artifactPath = telemetry.writeTextArtifact({
    attemptId,
    url: 'https://www.boats.com/boats-for-sale/',
    artifactType: 'page-html',
    extension: 'html',
    content: '<html><body>blocked</body></html>',
    contentType: 'text/html',
  })

  telemetry.recordAttemptComplete({
    attemptId,
    status: 'blocked',
    pageState: 'challenge_or_block',
    pageTitle: 'Access Denied',
    error: 'Blocked by policy',
  })

  telemetry.finishJob({
    status: 'stopped',
    boatsFound: 0,
    boatsScraped: 0,
    stopReason: 'challenge_or_block',
    lastPageState: 'challenge_or_block',
    lastUrl: 'https://www.boats.com/boats-for-sale/',
  })

  const job = db
    .prepare('SELECT source_key, parser_version, stop_reason FROM crawl_jobs WHERE id = ?')
    .get(jobId)
  const event = db
    .prepare('SELECT event_type, message FROM crawl_events WHERE crawl_job_id = ?')
    .get(jobId)
  const artifact = db
    .prepare('SELECT artifact_path, content_type FROM crawl_artifacts WHERE crawl_job_id = ?')
    .get(jobId)

  assert.equal(job.source_key, 'boats-com')
  assert.equal(job.parser_version, 'test-version')
  assert.equal(job.stop_reason, 'challenge_or_block')
  assert.equal(event.event_type, 'challenge_or_block')
  assert.equal(artifact.content_type, 'text/html')
  assert.equal(artifact.artifact_path, artifactPath)

  db.close()
})
