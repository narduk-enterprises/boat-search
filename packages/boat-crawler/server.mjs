#!/usr/bin/env node
/**
 * Simple web server to display boats from SQLite database
 */

import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'data', 'boats.db');

const app = express();
const PORT = process.env.PORT || 3001;
const SEARCH_LENGTH_MIN = 40;
const SEARCH_LENGTH_MAX = 60;
const SEARCH_TYPE = 'sport_fishing';
const SEARCH_LOCATION = 'Texas';

// Serve static files from public directory
app.use(express.static(join(__dirname, 'public')));

// API: Get all Texas boats
app.get('/api/boats', (req, res) => {
  try {
    const db = new Database(dbPath);
    const boats = db.prepare(`
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
    `).all(SEARCH_LENGTH_MIN, SEARCH_LENGTH_MAX, SEARCH_TYPE, SEARCH_LOCATION);
    
    // Parse JSON fields
    const boatsWithParsed = boats.map(boat => ({
      ...boat,
      images: boat.images ? JSON.parse(boat.images) : [],
      price: boat.price ? parseInt(boat.price, 10) : null,
      year: boat.year ? parseInt(boat.year, 10) : null,
    }));
    
    db.close();
    res.json(boatsWithParsed);
  } catch (error) {
    console.error('Error fetching boats:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get statistics
app.get('/api/stats', (req, res) => {
  try {
    const db = new Database(dbPath);
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
    
    db.close();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚤 Boat Finder UI running at http://localhost:${PORT}`);
  console.log(`   Database: ${dbPath}`);
});
