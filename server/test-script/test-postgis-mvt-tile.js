/**
 * Test PostGIS MVT tile content by making an HTTP request
 */

import http from 'http';

const tilesetId = 'mvt_postgis_1778086913639_dg17ok';
const z = 10;
const x = 872;
const y = 365;

const url = `http://localhost:3000/api/services/mvt/${tilesetId}/${z}/${x}/${y}.pbf`;

console.log('Fetching tile:', url);

http.get(url, (res) => {
  const chunks = [];
  
  res.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  res.on('end', async () => {
    const buffer = Buffer.concat(chunks);
    console.log('Tile size:', buffer.length, 'bytes');
    
    if (buffer.length === 0) {
      console.log('Tile is empty - no features at this zoom level');
      console.log('Try a different zoom level or check if data exists');
      return;
    }
    
    // Parse the PBF
    try {
      const pbfModule = await import('pbf');
      const VectorTileModule = await import('@mapbox/vector-tile');
      
      const vectorTile = new VectorTileModule.VectorTile(new pbfModule.default(buffer));
      
      console.log('\n=== Layers in tile ===');
      for (const layerName in vectorTile.layers) {
        const layer = vectorTile.layers[layerName];
        console.log(`\nLayer name: "${layerName}"`);
        console.log(`  Version: ${layer.version}`);
        console.log(`  Extent: ${layer.extent}`);
        console.log(`  Feature count: ${layer.length}`);
        
        if (layer.length > 0) {
          const feature = layer.feature(0);
          console.log(`  First feature properties:`, Object.keys(feature.properties).slice(0, 5));
          console.log(`  Geometry type:`, feature.type === 1 ? 'Point' : feature.type === 2 ? 'LineString' : 'Polygon');
          
          // Check geometry coordinates
          if (feature.loadGeometry) {
            const geom = feature.loadGeometry();
            console.log(`  First feature geometry points count:`, geom.length);
            if (geom.length > 0 && geom[0].length > 0) {
              const firstPoint = geom[0][0];
              console.log(`  First point coordinates:`, firstPoint);
              console.log(`  Coordinate range check:`);
              console.log(`    X in [-4096, 4096]?`, firstPoint.x >= -4096 && firstPoint.x <= 4096);
              console.log(`    Y in [-4096, 4096]?`, firstPoint.y >= -4096 && firstPoint.y <= 4096);
              
              // Check all points for out-of-range values
              let outOfRange = false;
              for (const ring of geom) {
                for (const point of ring) {
                  if (Math.abs(point.x) > 4096 || Math.abs(point.y) > 4096) {
                    outOfRange = true;
                    console.log(`    ⚠️  Out of range point found:`, point);
                    break;
                  }
                }
                if (outOfRange) break;
              }
              if (!outOfRange) {
                console.log(`    ✅ All coordinates within valid range`);
              }
            }
          }
        }
      }
      
      console.log('\n=== Analysis ===');
      const layerNames = Object.keys(vectorTile.layers);
      console.log('Available layer names:', layerNames);
      
      if (layerNames.includes('default')) {
        console.log('✅ Tile contains layer "default" - should work with current style');
      } else if (layerNames.includes('pipeline2d')) {
        console.log('❌ Tile contains layer "pipeline2d" but style expects "default"');
        console.log('   FIX: Change style JSON source-layer to "pipeline2d"');
      } else {
        console.log('⚠️  Unexpected layer names:', layerNames);
      }
      
    } catch (error) {
      console.error('Failed to parse tile:', error);
    }
  });
}).on('error', (err) => {
  console.error('Request failed:', err.message);
});
