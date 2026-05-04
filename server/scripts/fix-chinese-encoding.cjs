/**
 * Fix Chinese Character Encoding in Database
 * 
 * This script will:
 * 1. Clear all existing data sources with garbled Chinese characters
 * 2. Re-scan the workspace/data/local directory
 * 3. Re-register files with proper UTF-8 encoding
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const dbPath = path.join(__dirname, '..', '..', 'workspace', 'database', 'geoai-up.db');
const dataDir = path.join(__dirname, '..', '..', 'workspace', 'data', 'local');

console.log('Database path:', dbPath);
console.log('Data directory:', dataDir);

// Open database
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

console.log('\n=== Step 1: Check current data sources ===');
const currentSources = db.prepare('SELECT id, name, reference FROM data_sources').all();
console.log(`Found ${currentSources.length} data sources:`);
currentSources.forEach(ds => {
  console.log(`  - ${ds.name}: ${ds.reference}`);
});

console.log('\n=== Step 2: Scan actual files in data directory ===');
const files = fs.readdirSync(dataDir).filter(f => {
  const ext = path.extname(f).toLowerCase();
  return ['.geojson', '.json', '.shp', '.tif', '.tiff', '.csv'].includes(ext);
});

console.log(`Found ${files.length} files:`);
files.forEach(file => {
  const fullPath = path.join(dataDir, file);
  const stats = fs.statSync(fullPath);
  console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
});

console.log('\n=== Step 3: Clear existing data sources ===');
const deleteResult = db.prepare('DELETE FROM data_sources').run();
console.log(`Deleted ${deleteResult.changes} records`);

console.log('\n=== Step 4: Re-register files with proper encoding ===');

// Helper function to detect file type
function detectFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.geojson' || ext === '.json') return 'geojson';
  if (ext === '.shp') return 'shapefile';
  if (ext === '.tif' || ext === '.tiff') return 'raster';
  if (ext === '.csv') return 'csv';
  return 'unknown';
}

// Helper to generate UUID
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Helper to extract GeoJSON metadata
function extractGeoJSONMetadata(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(content);
    
    const metadata = {
      featureCount: 0,
      fields: [],
      crs: 'EPSG:4326'
    };
    
    if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
      metadata.featureCount = geojson.features.length;
      
      // Extract field names from first feature
      if (geojson.features.length > 0 && geojson.features[0].properties) {
        metadata.fields = Object.keys(geojson.features[0].properties);
      }
    }
    
    // Check for CRS
    if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
      const crsName = geojson.crs.properties.name;
      if (crsName.includes('4326')) {
        metadata.crs = 'EPSG:4326';
      } else if (crsName.includes('3857')) {
        metadata.crs = 'EPSG:3857';
      }
    }
    
    return metadata;
  } catch (error) {
    console.warn(`    ⚠ Could not extract GeoJSON metadata: ${error.message}`);
    return { featureCount: 0, fields: [], crs: 'EPSG:4326' };
  }
}

let registeredCount = 0;
for (const file of files) {
  try {
    const fullPath = path.join(dataDir, file);
    const stats = fs.statSync(fullPath);
    const fileType = detectFileType(file);
    
    // Create a clean name from filename (without timestamp suffix if present)
    let cleanName = file;
    const underscoreParts = file.split('_');
    if (underscoreParts.length > 2 && !isNaN(parseInt(underscoreParts[underscoreParts.length - 1]))) {
      // Remove timestamp suffix like _1777827645032
      cleanName = underscoreParts.slice(0, -1).join('_');
    }
    // Remove extension for display name
    const displayName = path.basename(cleanName, path.extname(cleanName));
    
    const id = generateId();
    const now = new Date().toISOString();
    
    // Use forward slashes for consistency
    const normalizedPath = fullPath.replace(/\\/g, '/');
    
    // Extract metadata based on file type
    let metadata = {
      fileSize: stats.size,
      originalFileName: file,
      uploadedAt: now
    };
    
    if (fileType === 'geojson') {
      console.log(`  Extracting metadata for ${file}...`);
      const geojsonMetadata = extractGeoJSONMetadata(fullPath);
      metadata = {
        ...metadata,
        ...geojsonMetadata
      };
      console.log(`    ✓ Feature count: ${geojsonMetadata.featureCount}`);
      console.log(`    ✓ Fields: ${geojsonMetadata.fields.length}`);
    }
    
    // Insert into database with proper UTF-8 encoding
    db.prepare(`
      INSERT INTO data_sources (id, name, type, reference, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      displayName,  // Name should be properly encoded UTF-8
      fileType,
      normalizedPath,
      JSON.stringify(metadata),
      now,
      now
    );
    
    registeredCount++;
    console.log(`✓ Registered: ${displayName} (${fileType})`);
  } catch (error) {
    console.error(`✗ Failed to register ${file}:`, error.message);
  }
}
  console.log(`\n=== Summary ===`);
  console.log(`Total files found: ${files.length}`);
  console.log(`Successfully registered: ${registeredCount}`);

  // Verify the results
  console.log('\n=== Step 5: Verify re-registered data sources ===');
  const finalSources = db.prepare('SELECT id, name, type, reference FROM data_sources').all();
  console.log(`Final count: ${finalSources.length} data sources:`);
  finalSources.forEach(ds => {
    console.log(`  - [${ds.type}] ${ds.name}`);
    console.log(`    Path: ${ds.reference}`);
  });

  // Check for any remaining garbled characters
  console.log('\n=== Step 6: Check for encoding issues ===');
  let hasEncodingIssues = false;
  finalSources.forEach(ds => {
    if (ds.reference.includes('?') || ds.name.includes('?')) {
      console.log(`⚠️  Potential encoding issue in: ${ds.name}`);
      hasEncodingIssues = true;
    }
  });

  if (!hasEncodingIssues) {
    console.log('✓ No encoding issues detected!');
  }

  db.close();
  console.log('\n✅ Database encoding fix completed!');
