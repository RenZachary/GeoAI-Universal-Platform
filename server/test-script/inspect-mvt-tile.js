/**
 * Debug script to inspect MVT tile content and layer names
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the most recent MVT tileset directory
const mvtDir = path.join(__dirname, '..', '..', 'workspace', 'results', 'mvt');

if (!fs.existsSync(mvtDir)) {
  console.log('MVT directory not found:', mvtDir);
  process.exit(1);
}

const tilesets = fs.readdirSync(mvtDir).filter(name => name.startsWith('mvt_postgis'));

if (tilesets.length === 0) {
  console.log('No PostGIS MVT tilesets found, checking GeoJSON...');
  const geojsonTilesets = fs.readdirSync(mvtDir).filter(name => name.startsWith('mvt_') && !name.startsWith('mvt_postgis'));
  if (geojsonTilesets.length === 0) {
    console.log('No MVT tilesets found at all');
    process.exit(1);
  }
  tilesets.push(...geojsonTilesets);
}

// Get the most recent tileset
const latestTileset = tilesets[tilesets.length - 1];
console.log('Analyzing tileset:', latestTileset);

const tilesetDir = path.join(mvtDir, latestTileset);

// Read metadata
const metadataPath = path.join(tilesetDir, 'metadata.json');
if (fs.existsSync(metadataPath)) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  console.log('\nMetadata:');
  console.log(JSON.stringify(metadata, null, 2));
}

// Find a tile file (try zoom level 0-5)
let tilePath = null;
for (let z = 0; z <= 5; z++) {
  const zDir = path.join(tilesetDir, String(z));
  if (!fs.existsSync(zDir)) continue;
  
  const xDirs = fs.readdirSync(zDir);
  if (xDirs.length === 0) continue;
  
  const xDir = path.join(zDir, xDirs[0]);
  const yFiles = fs.readdirSync(xDir);
  if (yFiles.length === 0) continue;
  
  tilePath = path.join(xDir, yFiles[0]);
  break;
}

if (!tilePath) {
  console.log('No tile files found');
  process.exit(1);
}

console.log('\nAnalyzing tile:', tilePath.replace(mvtDir, ''));

const tileBuffer = fs.readFileSync(tilePath);
console.log('Tile size:', tileBuffer.length, 'bytes');

if (tileBuffer.length === 0) {
  console.log('Tile is empty');
  process.exit(1);
}

// Parse the PBF
try {
  const vectorTile = new VectorTile.VectorTile(new pbf(tileBuffer));
  
  console.log('\n=== Layers in tile ===');
  for (const layerName in vectorTile.layers) {
    const layer = vectorTile.layers[layerName];
    console.log(`\nLayer name: "${layerName}"`);
    console.log(`  Version: ${layer.version}`);
    console.log(`  Extent: ${layer.extent}`);
    console.log(`  Feature count: ${layer.length}`);
    
    if (layer.length > 0) {
      const feature = layer.feature(0);
      console.log(`  First feature properties:`, Object.keys(feature.properties));
      console.log(`  Geometry type:`, feature.type === 1 ? 'Point' : feature.type === 2 ? 'LineString' : 'Polygon');
    }
  }
  
  console.log('\n=== Analysis ===');
  const layerNames = Object.keys(vectorTile.layers);
  if (layerNames.includes('default')) {
    console.log('✅ Tile contains layer named "default" - matches style JSON');
  } else if (layerNames.includes('pipeline2d')) {
    console.log('❌ Tile contains layer named "pipeline2d" but style expects "default"');
    console.log('   This is the ROOT CAUSE of the display issue!');
  } else {
    console.log('⚠️  Tile contains unexpected layer names:', layerNames);
  }
  
} catch (error) {
  console.error('Failed to parse tile:', error);
}
