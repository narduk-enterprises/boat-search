#!/usr/bin/env node
/**
 * Initialize the crawler SQLite schema, including telemetry/reporting tables.
 */

import { ensureCrawlerSchema, openCrawlerDatabase, resolveCrawlerPaths } from '../src/storage.mjs'

const { dbPath } = resolveCrawlerPaths(process.env)
const { db } = openCrawlerDatabase(process.env)

console.log('🗄️  Setting up crawler SQLite database...')
console.log(`   Database: ${dbPath}\n`)

ensureCrawlerSchema(db)

console.log('✅ Database setup complete!')
console.log('   Tables: boats, crawl_jobs, crawl_attempts, crawl_events, crawl_artifacts')
console.log(`   Database file: ${dbPath}\n`)

db.close()
