#!/usr/bin/env node
/**
 * View Texas boats from database
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');
const SEARCH_LENGTH_MIN = 40;
const SEARCH_LENGTH_MAX = 60;
const SEARCH_TYPE = 'sport_fishing';
const SEARCH_LOCATION = 'Texas';

const db = new Database(dbPath);

const boats = db.prepare(`
  SELECT 
    make, model, year, price, location, city, state,
    url, scraped_at
  FROM boats
  WHERE search_length_min = ?
    AND search_length_max = ?
    AND search_type = ?
    AND search_location = ?
    AND (state = 'Texas' OR location LIKE '%Texas%')
  ORDER BY CAST(price AS INTEGER) DESC
`).all(SEARCH_LENGTH_MIN, SEARCH_LENGTH_MAX, SEARCH_TYPE, SEARCH_LOCATION);

console.log(`\n🚤 Texas Boats (${boats.length} total)\n`);

boats.forEach((boat, i) => {
  console.log(`${i + 1}. ${boat.year || '?'} ${boat.make || ''} ${boat.model || ''}`);
  console.log(`   Price: $${boat.price ? parseInt(boat.price).toLocaleString() : 'N/A'}`);
  console.log(`   Location: ${boat.location || boat.city || 'Unknown'}`);
  console.log(`   URL: ${boat.url}`);
  console.log('');
});

const stats = db.prepare(`
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
`).get(SEARCH_LENGTH_MIN, SEARCH_LENGTH_MAX, SEARCH_TYPE, SEARCH_LOCATION);

console.log('📊 Statistics:');
console.log(`   Total boats: ${stats.total}`);
console.log(`   Unique makes: ${stats.makes}`);
if (stats.min_price) {
  console.log(`   Price range: $${stats.min_price.toLocaleString()} - $${stats.max_price.toLocaleString()}`);
  console.log(`   Average price: $${Math.round(stats.avg_price).toLocaleString()}`);
}

db.close();
