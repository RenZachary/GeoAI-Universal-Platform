/**
 * Check metadata format for Shaanxi data source
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', '..', 'workspace', 'database', 'geoai-up.db');
const db = new Database(dbPath);

// Get the Shaanxi data source
const row = db.prepare("SELECT id, type, reference, metadata FROM data_sources WHERE metadata LIKE '%陕西省%'").get();

if (row) {
  const metadata = JSON.parse(row.metadata);
  console.log('Data Source ID:', row.id);
  console.log('Type:', row.type);
  console.log('\nMetadata:');
  console.log(JSON.stringify(metadata, null, 2));
  
  console.log('\nFields format check:');
  if (Array.isArray(metadata.fields)) {
    console.log(`  Total fields: ${metadata.fields.length}`);
    console.log(`  First field type: ${typeof metadata.fields[0]}`);
    
    if (typeof metadata.fields[0] === 'object') {
      console.log('  ✅ Fields are in NEW format (object array with name and type)');
      console.log('  Sample field:', JSON.stringify(metadata.fields[0]));
    } else {
      console.log('  ❌ Fields are in OLD format (string array)');
      console.log('  Sample field:', metadata.fields[0]);
    }
  }
} else {
  console.log('❌ Data source not found');
}

db.close();
