#!/usr/bin/env node
/**
 * Setup SQLite database for boat listings
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');
const dataDir = join(__dirname, '..', 'data');

// Create data directory if it doesn't exist
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

console.log('🗄️  Setting up SQLite database...');
console.log(`   Database: ${dbPath}\n`);

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create boats table
db.exec(`
  CREATE TABLE IF NOT EXISTS boats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id TEXT UNIQUE,
    source TEXT NOT NULL DEFAULT 'boats.com',
    url TEXT NOT NULL UNIQUE,
    
    -- Basic info
    make TEXT,
    model TEXT,
    year INTEGER,
    length TEXT,
    price TEXT,
    currency TEXT DEFAULT 'USD',
    
    -- Location
    location TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'US',
    
    -- Details
    description TEXT,
    seller_type TEXT,
    listing_type TEXT,
    
    -- Images
    images TEXT, -- JSON array
    
    -- Metadata
    full_text TEXT,
    scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    
    -- Search criteria (for tracking what search found this)
    search_length_min INTEGER,
    search_length_max INTEGER,
    search_type TEXT,
    search_location TEXT
  )
`);

// Create indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_boats_listing_id ON boats(listing_id);
  CREATE INDEX IF NOT EXISTS idx_boats_url ON boats(url);
  CREATE INDEX IF NOT EXISTS idx_boats_make_model ON boats(make, model);
  CREATE INDEX IF NOT EXISTS idx_boats_year ON boats(year);
  CREATE INDEX IF NOT EXISTS idx_boats_price ON boats(price);
  CREATE INDEX IF NOT EXISTS idx_boats_state ON boats(state);
  CREATE INDEX IF NOT EXISTS idx_boats_scraped_at ON boats(scraped_at);
`);

// Create a table for crawl jobs (tracking)
db.exec(`
  CREATE TABLE IF NOT EXISTS crawl_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    search_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
    boats_found INTEGER DEFAULT 0,
    boats_scraped INTEGER DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    error TEXT
  )
`);

console.log('✅ Database setup complete!');
console.log(`   Tables: boats, crawl_jobs`);
console.log(`   Database file: ${dbPath}\n`);

db.close();
