import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createTimestampSlug, ensureDir, hashText, safeJsonParse, slugify } from './utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DEFAULT_DB_PATH = join(__dirname, '..', 'data', 'boats.db')
const DEFAULT_DATA_DIR = join(__dirname, '..', 'data')

function hasColumn(db, tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return columns.some((column) => column.name === columnName)
}

function ensureColumn(db, tableName, columnName, definition) {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`)
  }
}

export function resolveCrawlerPaths(env = process.env) {
  const dbPath = env.BOAT_CRAWLER_DB_PATH?.trim() || DEFAULT_DB_PATH
  const dataDir = env.BOAT_CRAWLER_DATA_DIR?.trim() || DEFAULT_DATA_DIR
  return { dbPath, dataDir }
}

export function openCrawlerDatabase(env = process.env) {
  const { dbPath, dataDir } = resolveCrawlerPaths(env)
  ensureDir(dataDir)
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  return { db, dbPath, dataDir }
}

export function ensureCrawlerSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT UNIQUE,
      source TEXT NOT NULL DEFAULT 'boats.com',
      url TEXT NOT NULL UNIQUE,
      make TEXT,
      model TEXT,
      year INTEGER,
      length TEXT,
      price TEXT,
      currency TEXT DEFAULT 'USD',
      location TEXT,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'US',
      description TEXT,
      seller_type TEXT,
      listing_type TEXT,
      images TEXT,
      full_text TEXT,
      scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      search_length_min INTEGER,
      search_length_max INTEGER,
      search_type TEXT,
      search_location TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_boats_listing_id ON boats(listing_id);
    CREATE INDEX IF NOT EXISTS idx_boats_url ON boats(url);
    CREATE INDEX IF NOT EXISTS idx_boats_make_model ON boats(make, model);
    CREATE INDEX IF NOT EXISTS idx_boats_year ON boats(year);
    CREATE INDEX IF NOT EXISTS idx_boats_price ON boats(price);
    CREATE INDEX IF NOT EXISTS idx_boats_state ON boats(state);
    CREATE INDEX IF NOT EXISTS idx_boats_scraped_at ON boats(scraped_at);

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      search_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      boats_found INTEGER DEFAULT 0,
      boats_scraped INTEGER DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS crawl_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_job_id INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      url TEXT NOT NULL,
      page_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      page_state TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      dom_hash TEXT,
      page_title TEXT,
      error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (crawl_job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_attempts_job ON crawl_attempts(crawl_job_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_attempts_status ON crawl_attempts(status);
    CREATE INDEX IF NOT EXISTS idx_crawl_attempts_state ON crawl_attempts(page_state);

    CREATE TABLE IF NOT EXISTS crawl_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_job_id INTEGER NOT NULL,
      attempt_id INTEGER,
      source_key TEXT NOT NULL,
      url TEXT,
      stage TEXT NOT NULL,
      level TEXT NOT NULL,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (crawl_job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (attempt_id) REFERENCES crawl_attempts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_events_job ON crawl_events(crawl_job_id);
    CREATE INDEX IF NOT EXISTS idx_crawl_events_stage ON crawl_events(stage);

    CREATE TABLE IF NOT EXISTS crawl_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawl_job_id INTEGER NOT NULL,
      attempt_id INTEGER,
      source_key TEXT NOT NULL,
      url TEXT,
      artifact_type TEXT NOT NULL,
      artifact_path TEXT NOT NULL,
      content_type TEXT,
      content_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (crawl_job_id) REFERENCES crawl_jobs(id) ON DELETE CASCADE,
      FOREIGN KEY (attempt_id) REFERENCES crawl_attempts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_crawl_artifacts_job ON crawl_artifacts(crawl_job_id);
  `)

  ensureColumn(db, 'crawl_jobs', 'source_key', 'source_key TEXT')
  ensureColumn(db, 'crawl_jobs', 'parser_version', 'parser_version TEXT')
  ensureColumn(db, 'crawl_jobs', 'fallback_strategy', 'fallback_strategy TEXT')
  ensureColumn(db, 'crawl_jobs', 'stop_reason', 'stop_reason TEXT')
  ensureColumn(db, 'crawl_jobs', 'last_page_state', 'last_page_state TEXT')
  ensureColumn(db, 'crawl_jobs', 'last_url', 'last_url TEXT')
}

export function createBoatUpsertStatement(db) {
  return db.prepare(`
    INSERT INTO boats (
      listing_id, source, url, make, model, year, length, price, currency,
      location, city, state, country, description, seller_type, listing_type,
      images, full_text, scraped_at, updated_at,
      search_length_min, search_length_max, search_type, search_location
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO UPDATE SET
      listing_id = excluded.listing_id,
      source = excluded.source,
      make = excluded.make,
      model = excluded.model,
      year = excluded.year,
      length = excluded.length,
      price = excluded.price,
      currency = excluded.currency,
      location = excluded.location,
      city = excluded.city,
      state = excluded.state,
      country = excluded.country,
      description = excluded.description,
      seller_type = excluded.seller_type,
      listing_type = excluded.listing_type,
      images = excluded.images,
      full_text = excluded.full_text,
      scraped_at = excluded.scraped_at,
      updated_at = excluded.updated_at,
      search_length_min = excluded.search_length_min,
      search_length_max = excluded.search_length_max,
      search_type = excluded.search_type,
      search_location = excluded.search_location
  `)
}

export function createBoatFindStatement(db) {
  return db.prepare('SELECT id FROM boats WHERE url = ?')
}

export function normalizeBoatImages(value) {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? JSON.stringify(value) : null
  }

  if (typeof value === 'string') {
    const parsed = safeJsonParse(value, null)
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? JSON.stringify(parsed) : null
    }
    return value
  }

  return null
}

export function upsertBoatRecord({ db, upsertStatement, findStatement, boatData, searchContext }) {
  const now = boatData.scrapedAt || new Date().toISOString()
  const existing = findStatement.get(boatData.url)

  upsertStatement.run(
    boatData.listingId || null,
    boatData.source,
    boatData.url,
    boatData.make || null,
    boatData.model || null,
    boatData.year ? parseInt(boatData.year, 10) : null,
    boatData.length || null,
    boatData.price || null,
    boatData.currency || 'USD',
    boatData.location || null,
    boatData.city || null,
    boatData.state || null,
    boatData.country || 'US',
    boatData.description || null,
    boatData.sellerType || null,
    boatData.listingType || null,
    normalizeBoatImages(boatData.images),
    boatData.fullText || null,
    now,
    now,
    searchContext.lengthMin ?? null,
    searchContext.lengthMax ?? null,
    searchContext.searchType ?? null,
    searchContext.searchLocation ?? null,
  )

  return existing ? 'updated' : 'inserted'
}

export function getBoatDatabaseStats(db) {
  return db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT make) as makes FROM boats').get()
}

export class TelemetryRecorder {
  constructor({ db, dataDir, sourceKey, parserVersion, fallbackStrategy }) {
    this.db = db
    this.dataDir = dataDir
    this.sourceKey = sourceKey
    this.parserVersion = parserVersion
    this.fallbackStrategy = fallbackStrategy
    this.jobId = null
  }

  startJob({ searchUrl }) {
    const result = this.db
      .prepare(
        `
        INSERT INTO crawl_jobs (
          search_url, status, started_at, source_key, parser_version, fallback_strategy
        ) VALUES (?, 'running', datetime('now'), ?, ?, ?)
      `,
      )
      .run(searchUrl, this.sourceKey, this.parserVersion, this.fallbackStrategy)

    this.jobId = result.lastInsertRowid
    return this.jobId
  }

  finishJob({
    status,
    boatsFound,
    boatsScraped,
    stopReason = null,
    lastPageState = null,
    lastUrl = null,
    error = null,
  }) {
    this.db
      .prepare(
        `
        UPDATE crawl_jobs
        SET status = ?,
            boats_found = ?,
            boats_scraped = ?,
            completed_at = datetime('now'),
            stop_reason = ?,
            last_page_state = ?,
            last_url = ?,
            error = ?
        WHERE id = ?
      `,
      )
      .run(status, boatsFound, boatsScraped, stopReason, lastPageState, lastUrl, error, this.jobId)
  }

  recordAttemptStart({ url, pageKind, retryCount = 0 }) {
    const result = this.db
      .prepare(
        `
        INSERT INTO crawl_attempts (
          crawl_job_id, source_key, url, page_kind, status, page_state, parser_version, retry_count
        ) VALUES (?, ?, ?, ?, 'started', 'ok', ?, ?)
      `,
      )
      .run(this.jobId, this.sourceKey, url, pageKind, this.parserVersion, retryCount)

    return result.lastInsertRowid
  }

  recordAttemptComplete({
    attemptId,
    status,
    pageState,
    domHash = null,
    pageTitle = null,
    error = null,
  }) {
    this.db
      .prepare(
        `
        UPDATE crawl_attempts
        SET status = ?,
            page_state = ?,
            dom_hash = ?,
            page_title = ?,
            error = ?,
            completed_at = datetime('now')
        WHERE id = ?
      `,
      )
      .run(status, pageState, domHash, pageTitle, error, attemptId)
  }

  recordEvent({ attemptId = null, url = null, stage, level, eventType, message, metadata = null }) {
    const result = this.db
      .prepare(
        `
        INSERT INTO crawl_events (
          crawl_job_id, attempt_id, source_key, url, stage, level, event_type, message, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        this.jobId,
        attemptId,
        this.sourceKey,
        url,
        stage,
        level,
        eventType,
        message,
        metadata ? JSON.stringify(metadata) : null,
      )

    return result.lastInsertRowid
  }

  writeTextArtifact({ attemptId, url, artifactType, extension, content, contentType }) {
    const artifactDir = join(this.dataDir, 'artifacts', this.sourceKey, String(this.jobId))
    ensureDir(artifactDir)
    const fileName = `${createTimestampSlug()}-${slugify(artifactType)}.${extension}`
    const artifactPath = join(artifactDir, fileName)
    writeFileSync(artifactPath, content, 'utf8')
    const contentHash = hashText(content)

    this.db
      .prepare(
        `
        INSERT INTO crawl_artifacts (
          crawl_job_id, attempt_id, source_key, url, artifact_type, artifact_path, content_type, content_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        this.jobId,
        attemptId,
        this.sourceKey,
        url,
        artifactType,
        artifactPath,
        contentType,
        contentHash,
      )

    return artifactPath
  }

  async capturePageArtifacts({ page, attemptId, url, includeScreenshot = true }) {
    if (!page) {
      return []
    }

    const paths = []
    const html = await page.content().catch(() => null)
    const title = await page.title().catch(() => '')
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '')

    if (html) {
      const htmlPath = this.writeTextArtifact({
        attemptId,
        url,
        artifactType: 'page-html',
        extension: 'html',
        content: html,
        contentType: 'text/html',
      })
      paths.push(htmlPath)
    }

    const signalPath = this.writeTextArtifact({
      attemptId,
      url,
      artifactType: 'page-signal',
      extension: 'json',
      content: `${JSON.stringify({ title, body }, null, 2)}\n`,
      contentType: 'application/json',
    })
    paths.push(signalPath)

    if (includeScreenshot) {
      const artifactDir = join(this.dataDir, 'artifacts', this.sourceKey, String(this.jobId))
      ensureDir(artifactDir)
      const screenshotPath = join(
        artifactDir,
        `${createTimestampSlug()}-${slugify(artifactTypeFromUrl(url))}.png`,
      )

      const shotOk = await page
        .screenshot({ path: screenshotPath, fullPage: false })
        .then(() => true)
        .catch(() => false)
      if (shotOk) {
        const contentHash = createHash('sha256').update(readFileSync(screenshotPath)).digest('hex')
        this.db
          .prepare(
            `
            INSERT INTO crawl_artifacts (
              crawl_job_id, attempt_id, source_key, url, artifact_type, artifact_path, content_type, content_hash
            ) VALUES (?, ?, ?, ?, 'page-screenshot', ?, 'image/png', ?)
          `,
          )
          .run(this.jobId, attemptId, this.sourceKey, url, screenshotPath, contentHash)
        paths.push(screenshotPath)
      }
    }

    return paths
  }
}

function artifactTypeFromUrl(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}-${parsed.pathname}`
  } catch {
    return url
  }
}
