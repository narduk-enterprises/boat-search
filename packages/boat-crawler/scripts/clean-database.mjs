#!/usr/bin/env node
/**
 * Clean database - remove invalid boats that don't meet criteria
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBoat } from './validate-boat.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'boats.db');

const db = new Database(dbPath);

console.log('🧹 Cleaning database...\n');

// Get all boats
const boats = db.prepare(`
  SELECT 
    id, listing_id, url, make, model, year, length, price,
    location, city, state, description, full_text
  FROM boats
`).all();

console.log(`Found ${boats.length} boats in database\n`);

let validCount = 0;
let invalidCount = 0;
const toDelete = [];

for (const boat of boats) {
  const validation = validateBoat(boat, {
    minLength: 40,
    maxLength: 60,
    requiredState: 'Texas',
  });
  
  if (!validation.valid) {
    invalidCount++;
    toDelete.push(boat.id);
    console.log(`❌ Invalid: ${boat.make || ''} ${boat.model || ''} (ID: ${boat.id})`);
    console.log(`   Errors: ${validation.errors.join(', ')}`);
    console.log(`   URL: ${boat.url}\n`);
  } else {
    validCount++;
    if (validation.warnings.length > 0) {
      console.log(`⚠️  ${boat.make || ''} ${boat.model || ''} (ID: ${boat.id}) - Warnings: ${validation.warnings.join(', ')}`);
    }
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Valid boats: ${validCount}`);
console.log(`   Invalid boats: ${invalidCount}`);

if (toDelete.length > 0) {
  console.log(`\n🗑️  Deleting ${toDelete.length} invalid boats...`);
  
  const deleteStmt = db.prepare('DELETE FROM boats WHERE id = ?');
  const deleteMany = db.transaction((ids) => {
    for (const id of ids) {
      deleteStmt.run(id);
    }
  });
  
  deleteMany(toDelete);
  
  console.log(`✅ Deleted ${toDelete.length} invalid boats`);
} else {
  console.log(`\n✅ All boats are valid!`);
}

db.close();
