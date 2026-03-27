#!/usr/bin/env node
/**
 * Simple web server to display boats from SQLite database
 */

import express from 'express'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dbPath = join(__dirname, 'data', 'boats.db')

const app = express()
const PORT = process.env.PORT || 3001
const SEARCH_LENGTH_MIN = 40
const SEARCH_LENGTH_MAX = 60
const SEARCH_TYPE = 'sport_fishing'
const SEARCH_LOCATION = 'Texas'

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')))

// API: Get all Texas boats
app.get('/api/boats', (req, res) => {
  try {
    const db = new Database(dbPath)
    const boats = db
      .prepare(
        `
      SELECT 
        id, listing_id, source, url,
        make, model, year, length, price, currency,
        location, city, state, country,
        description, seller_type, listing_type,
        images, scraped_at
      FROM boats
      WHERE search_length_min = ?
        AND search_length_max = ?
        AND search_type = ?
        AND search_location = ?
        AND (state = 'Texas' OR location LIKE '%Texas%')
      ORDER BY CAST(price AS INTEGER) DESC
    `,
      )
      .all(SEARCH_LENGTH_MIN, SEARCH_LENGTH_MAX, SEARCH_TYPE, SEARCH_LOCATION)

    // Parse JSON fields
    const boatsWithParsed = boats.map((boat) => ({
      ...boat,
      images: boat.images ? JSON.parse(boat.images) : [],
      price: boat.price ? parseInt(boat.price, 10) : null,
      year: boat.year ? parseInt(boat.year, 10) : null,
    }))

    db.close()
    res.json(boatsWithParsed)
  } catch (error) {
    console.error('Error fetching boats:', error)
    res.status(500).json({ error: error.message })
  }
})

// API: Get statistics
app.get('/api/stats', (req, res) => {
  try {
    const db = new Database(dbPath)
    const stats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT make) as makes,
        MIN(CAST(price AS INTEGER)) as min_price,
        MAX(CAST(price AS INTEGER)) as max_price,
        AVG(CAST(price AS INTEGER)) as avg_price
      FROM boats
      WHERE search_length_min = ?
        AND search_length_max = ?
        AND search_type = ?
        AND search_location = ?
        AND (state = 'Texas' OR location LIKE '%Texas%')
    `,
      )
      .get(SEARCH_LENGTH_MIN, SEARCH_LENGTH_MAX, SEARCH_TYPE, SEARCH_LOCATION)

    db.close()
    res.json(stats)
  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: error.message })
  }
})

// API: Recent crawl jobs
app.get('/api/crawl-jobs', (req, res) => {
  try {
    const db = new Database(dbPath)
    const jobs = db
      .prepare(
        `
      SELECT
        id,
        source_key,
        status,
        boats_found,
        boats_scraped,
        parser_version,
        stop_reason,
        last_page_state,
        last_url,
        started_at,
        completed_at,
        error
      FROM crawl_jobs
      ORDER BY id DESC
      LIMIT 25
    `,
      )
      .all()
    db.close()
    res.json(jobs)
  } catch (error) {
    console.error('Error fetching crawl jobs:', error)
    res.status(500).json({ error: error.message })
  }
})

// API: Crawl events for a job
app.get('/api/crawl-events', (req, res) => {
  try {
    const jobId = parseInt(req.query.jobId, 10)
    if (!Number.isFinite(jobId)) {
      res.status(400).json({ error: 'jobId query param is required' })
      return
    }

    const db = new Database(dbPath)
    const events = db
      .prepare(
        `
      SELECT
        id,
        attempt_id,
        source_key,
        url,
        stage,
        level,
        event_type,
        message,
        metadata_json,
        created_at
      FROM crawl_events
      WHERE crawl_job_id = ?
      ORDER BY id DESC
      LIMIT 200
    `,
      )
      .all(jobId)
    db.close()

    res.json(
      events.map((event) => ({
        ...event,
        metadata: event.metadata_json ? JSON.parse(event.metadata_json) : null,
      })),
    )
  } catch (error) {
    console.error('Error fetching crawl events:', error)
    res.status(500).json({ error: error.message })
  }
})

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚤 Boat Finder UI running at http://localhost:${PORT}`)
  console.log(`   Database: ${dbPath}`)
})
