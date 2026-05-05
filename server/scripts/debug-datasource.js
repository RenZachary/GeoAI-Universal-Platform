/**
 * Debug script to check data source metadata
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'workspace', 'database', 'geoai.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Check if table exists
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('\nAvailable tables:', tables.map(t => t.name));

// Get the specific data source
const dataSourceId = '1c299794-a95d-4279-b92e-8ceee8b6816e';
const row = db.prepare('SELECT id, type, reference, metadata FROM data_sources WHERE id = ?').get(dataSourceId);

if (!row) {
  console.log('\n❌ Data source not found:', dataSourceId);
  db.close();
  process.exit(1);
}

console.log('\n✅ Data source found:');
console.log('ID:', row.id);
console.log('Type:', row.type);
console.log('Reference:', row.reference);

const metadata = JSON.parse(row.metadata);
console.log('\nMetadata:');
console.log('- Feature count:', metadata.featureCount);
console.log('- Geometry type:', metadata.geometryType);
console.log('\nFields:');
if (metadata.fields && Array.isArray(metadata.fields)) {
  metadata.fields.forEach((field, idx) => {
    console.log(`  ${idx + 1}. ${field.name} (${field.type})`);
  });
} else {
  console.log('  No fields in metadata');
}

db.close();
