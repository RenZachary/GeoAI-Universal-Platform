/**
 * Test MVT tile content
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pbf from 'pbf';
import VectorTile from '@mapbox/vector-tile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read a sample tile
const tilePath = path.join(__dirname, '..', 'workspace', 'results', 'mvt', 'mvt_1777980564130_uikfde', '4', '12', '6.pbf');

if (!fs.existsSync(tilePath)) {
  console.log('Tile not found at:', tilePath);
  console.log('Please check the actual tile path');
  process.exit(1);
}

const tileBuffer = fs.readFileSync(tilePath);
console.log('Tile size:', tileBuffer.length, 'bytes');

// Parse the PBF
const vectorTile = new VectorTile.VectorTile(new pbf(tileBuffer));

console.log('\nLayers in tile:');
for (const layerName in vectorTile.layers) {
  const layer = vectorTile.layers[layerName];
  console.log(`\nLayer: ${layerName}`);
  console.log(`  Version: ${layer.version}`);
  console.log(`  Extent: ${layer.extent}`);
  console.log(`  Feature count: ${layer.length}`);
  
  if (layer.length > 0) {
    const feature = layer.feature(0);
    console.log(`  First feature properties:`, feature.properties);
    console.log(`  First feature type:`, feature.type === 1 ? 'Point' : feature.type === 2 ? 'LineString' : 'Polygon');
  }
}
