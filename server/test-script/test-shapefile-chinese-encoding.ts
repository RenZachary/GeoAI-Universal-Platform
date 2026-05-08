/**
 * Test script for Shapefile Chinese encoding fix
 */

import path from 'path';
import fs from 'fs';
import { ShapefileAccessor } from '../src/data-access/accessors/ShapefileAccessor.js';

async function testChineseEncoding() {
  console.log('=== Testing Shapefile Chinese Encoding Fix ===\n');
  
  // Find a shapefile with Chinese characters in workspace
  const workspaceBase = process.cwd();
  const dataDir = path.join(workspaceBase, '..', 'workspace', 'data');
  
  // Look for shapefiles
  let testShapefile: string | null = null;
  
  if (fs.existsSync(dataDir)) {
    const findShapefile = (dir: string): string | null => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          const result = findShapefile(fullPath);
          if (result) return result;
        } else if (file.toLowerCase().endsWith('.shp')) {
          return fullPath;
        }
      }
      return null;
    };
    
    testShapefile = findShapefile(dataDir);
  }
  
  if (!testShapefile) {
    console.log('No shapefile found in workspace. Please upload a Chinese shapefile first.');
    console.log('Expected location:', dataDir);
    return;
  }
  
  console.log('Testing shapefile:', testShapefile);
  console.log('File size:', fs.statSync(testShapefile).size, 'bytes\n');
  
  // Check for companion files
  const baseName = testShapefile.replace('.shp', '');
  const hasDbf = fs.existsSync(baseName + '.dbf');
  const hasPrj = fs.existsSync(baseName + '.prj');
  const hasShx = fs.existsSync(baseName + '.shx');
  
  console.log('Companion files:');
  console.log('  .shx:', hasShx ? '✓' : '✗');
  console.log('  .dbf:', hasDbf ? '✓' : '✗');
  console.log('  .prj:', hasPrj ? '✓' : '✗');
  console.log();
  
  // Create accessor and load data
  const accessor = new ShapefileAccessor(path.join(workspaceBase, '..'));
  
  try {
    console.log('Loading shapefile with auto-detection...\n');
    const nativeData = await accessor.read(testShapefile);
    
    console.log('Metadata:');
    console.log('  Feature count:', nativeData.metadata.featureCount);
    console.log('  Geometry type:', nativeData.metadata.geometryType);
    console.log('  CRS:', nativeData.metadata.crs || 'Unknown');
    console.log('  Fields:', nativeData.metadata.fields?.length || 0);
    
    if (nativeData.metadata.fields && nativeData.metadata.fields.length > 0) {
      console.log('\nField definitions:');
      nativeData.metadata.fields.forEach(field => {
        console.log(`  - ${field.name} (${field.type})`);
      });
    }
    
    // Load as GeoJSON to check encoding
    console.log('\nLoading as GeoJSON to verify encoding...');
    const geojson = await (accessor as any).loadGeoJSON(testShapefile);
    
    if (geojson.features.length > 0) {
      const firstFeature = geojson.features[0];
      console.log('\nFirst feature properties sample:');
      
      const props = firstFeature.properties as Record<string, any>;
      const keys = Object.keys(props);
      
      // Show first 5 properties
      const sampleKeys = keys.slice(0, 5);
      sampleKeys.forEach(key => {
        const value = props[key];
        const displayValue = typeof value === 'string' 
          ? `"${value}"` 
          : String(value);
        
        // Check for replacement character (garbled text indicator)
        const hasGarbled = typeof value === 'string' && value.includes('\ufffd');
        const status = hasGarbled ? '❌ GARBLEDED' : '✓ OK';
        
        console.log(`  ${key}: ${displayValue} ${status}`);
      });
      
      // Check all string properties for garbled text
      let garbledCount = 0;
      let totalStringProps = 0;
      
      geojson.features.forEach((feature: any, idx: number) => {
        const featureProps = feature.properties as Record<string, any>;
        Object.values(featureProps).forEach(value => {
          if (typeof value === 'string') {
            totalStringProps++;
            if (value.includes('\ufffd')) {
              garbledCount++;
            }
          }
        });
      });
      
      console.log(`\nEncoding quality check:`);
      console.log(`  Total string properties: ${totalStringProps}`);
      console.log(`  Garbled properties: ${garbledCount}`);
      console.log(`  Success rate: ${((1 - garbledCount / totalStringProps) * 100).toFixed(2)}%`);
      
      if (garbledCount === 0) {
        console.log('\n✅ SUCCESS: All Chinese characters loaded correctly!');
      } else {
        console.log('\n⚠️  WARNING: Some properties contain garbled text.');
        console.log('This may indicate the shapefile uses an unsupported encoding.');
      }
    }
    
  } catch (error) {
    console.error('Error loading shapefile:', error instanceof Error ? error.message : error);
    console.error(error instanceof Error ? error.stack : '');
  }
}

// Run test
testChineseEncoding().catch(console.error);
