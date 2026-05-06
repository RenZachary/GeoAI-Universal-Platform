/**
 * Check PostGIS table bounding box
 */

import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgis_36_sample',
  user: 'postgres',
  password: '123456'
});

async function checkBbox() {
  try {
    console.log('Connecting to PostGIS...');
    
    // Get bounding box of pipeline2d table
    const result = await pool.query(`
      SELECT 
        ST_XMin(ST_Extent(geom)) as xmin,
        ST_YMin(ST_Extent(geom)) as ymin,
        ST_XMax(ST_Extent(geom)) as xmax,
        ST_YMax(ST_Extent(geom)) as ymax,
        ST_SRID(geom) as srid,
        COUNT(*) as feature_count
      FROM public.pipeline2d
      GROUP BY ST_SRID(geom)
    `);
    
    if (result.rows.length === 0) {
      console.log('No data found in pipeline2d table');
      return;
    }
    
    const row = result.rows[0];
    console.log('\n=== Pipeline2d Table Info ===');
    console.log('Feature count:', row.feature_count);
    console.log('SRID:', row.srid);
    console.log('Bounding Box:');
    console.log(`  Min X: ${row.xmin}`);
    console.log(`  Min Y: ${row.ymin}`);
    console.log(`  Max X: ${row.xmax}`);
    console.log(`  Max Y: ${row.ymax}`);
    console.log(`  Center: [${(parseFloat(row.xmin) + parseFloat(row.xmax)) / 2}, ${(parseFloat(row.ymin) + parseFloat(row.ymax)) / 2}]`);
    
    console.log('\n=== Suggested Map Center ===');
    const centerX = (parseFloat(row.xmin) + parseFloat(row.xmax)) / 2;
    const centerY = (parseFloat(row.ymin) + parseFloat(row.ymax)) / 2;
    console.log(`Center: [${centerX}, ${centerY}]`);
    console.log(`Recommended zoom level: 8-12 (depending on extent)`);
    
    console.log('\n=== JavaScript Console Command ===');
    console.log(`map.flyTo({ center: [${centerX}, ${centerY}], zoom: 10 })`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkBbox();
