/**
 * Test script to debug Shapefile Chinese encoding issues
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ShapefileAccessor } from '../src/data-access/accessors/ShapefileAccessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testEncoding() {
  console.log('=== Testing Shapefile Chinese Encoding ===\n');
  
  // Find shapefiles in workspace
  const workspaceBase = path.join(__dirname, '..', '..');
  const dataDir = path.join(workspaceBase, 'workspace', 'data', 'local');
  
  if (!fs.existsSync(dataDir)) {
    console.error('Data directory not found:', dataDir);
    return;
  }
  
  // Find .shp files
  const shpFiles = fs.readdirSync(dataDir).filter(f => f.toLowerCase().endsWith('.shp'));
  
  if (shpFiles.length === 0) {
    console.log('No shapefiles found in:', dataDir);
    return;
  }
  
  console.log(`Found ${shpFiles.length} shapefile(s):\n`);
  
  for (const shpFile of shpFiles) {
    const shpPath = path.join(dataDir, shpFile);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${shpFile}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
      const accessor = new ShapefileAccessor(workspaceBase);
      
      // Step 1: Read metadata
      console.log('Step 1: Reading metadata...');
      const nativeData = await accessor.read(shpPath);
      console.log(`✓ Feature count: ${nativeData.metadata.featureCount}`);
      console.log(`✓ Geometry type: ${nativeData.metadata.geometryType}`);
      console.log(`✓ Fields: ${nativeData.metadata.fields?.length || 0}\n`);
      
      if (nativeData.metadata.fields && nativeData.metadata.fields.length > 0) {
        console.log('Field definitions:');
        nativeData.metadata.fields.forEach((field, idx) => {
          console.log(`  ${idx + 1}. ${field.name} (${field.type})`);
        });
        console.log();
      }
      
      // Step 2: Load as GeoJSON (this triggers encoding detection)
      console.log('Step 2: Loading as GeoJSON with encoding auto-detection...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const geojson = await (accessor as any).loadGeoJSON(shpPath);
      console.log(`✓ Loaded ${geojson.features.length} features\n`);
      
      if (geojson.features.length === 0) {
        console.log('⚠️  No features found\n');
        continue;
      }
      
      // Step 3: Analyze properties for Chinese characters
      console.log('Step 3: Analyzing property encoding...\n');
      
      let totalStringProps = 0;
      let chineseProps = 0;
      let garbledProps = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sampleValues: Array<{key: string; value: any}> = [];
      
      // Check first 5 features
      const sampleSize = Math.min(5, geojson.features.length);
      for (let i = 0; i < sampleSize; i++) {
        const feature = geojson.features[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = feature.properties as Record<string, any>;
        
        if (!props) continue;
        
        Object.entries(props).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length > 0) {
            totalStringProps++;
            
            // Check for Chinese characters
            const hasChinese = /[\u4e00-\u9fff]/.test(value);
            if (hasChinese) {
              chineseProps++;
            }
            
            // Check for replacement character (garbled)
            const hasReplacement = value.includes('\ufffd');
            if (hasReplacement) {
              garbledProps++;
            }
            
            // Collect sample values
            if (sampleValues.length < 10) {
              sampleValues.push({ key, value });
            }
          }
        });
      }
      
      console.log(`Statistics (first ${sampleSize} features):`);
      console.log(`  Total string properties: ${totalStringProps}`);
      console.log(`  Properties with Chinese: ${chineseProps}`);
      console.log(`  Properties with garbled text: ${garbledProps}`);
      console.log(`  Success rate: ${totalStringProps > 0 ? ((1 - garbledProps / totalStringProps) * 100).toFixed(2) : 'N/A'}%\n`);
      
      if (sampleValues.length > 0) {
        console.log('Sample property values:');
        sampleValues.slice(0, 10).forEach(({ key, value }) => {
          const displayValue = typeof value === 'string' && value.length > 50 
            ? value.substring(0, 50) + '...' 
            : value;
          
          const hasChinese = typeof value === 'string' && /[\u4e00-\u9fff]/.test(value);
          const hasGarbled = typeof value === 'string' && value.includes('\ufffd');
          
          const status = hasGarbled ? '❌ GARBLEDED' : (hasChinese ? '✓ CHINESE' : '○ ASCII');
          console.log(`  ${key}: "${displayValue}" ${status}`);
        });
        console.log();
      }
      
      // Step 4: Save to GeoJSON and verify
      console.log('Step 4: Saving to GeoJSON file...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const savedPath = await (accessor as any).saveGeoJSON(geojson);
      console.log(`✓ Saved to: ${savedPath}\n`);
      
      // Verify the saved file
      console.log('Step 5: Verifying saved GeoJSON file...');
      const savedContent = fs.readFileSync(savedPath, 'utf-8');
      const savedGeoJSON = JSON.parse(savedContent);
      
      let savedChineseCount = 0;
      let savedGarbledCount = 0;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      savedGeoJSON.features.slice(0, sampleSize).forEach((feature: any) => {
        const props = feature.properties;
        if (!props) return;
        
        Object.values(props).forEach((value: unknown) => {
          if (typeof value === 'string') {
            if (/[\u4e00-\u9fff]/.test(value)) savedChineseCount++;
            if (value.includes('\ufffd')) savedGarbledCount++;
          }
        });
      });
      
      console.log(`Saved file analysis:`);
      console.log(`  Chinese properties: ${savedChineseCount}`);
      console.log(`  Garbled properties: ${savedGarbledCount}\n`);
      
      if (savedGarbledCount > 0) {
        console.log('❌ PROBLEM DETECTED: Saved GeoJSON contains garbled text!');
        console.log('   This means encoding detection failed or data was corrupted during save.\n');
      } else if (savedChineseCount > 0) {
        console.log('✅ SUCCESS: Chinese characters preserved correctly!\n');
      } else {
        console.log('⚠️  WARNING: No Chinese characters found in this file.\n');
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${shpFile}:`, error instanceof Error ? error.message : error);
      console.error(error instanceof Error ? error.stack : '');
    }
  }
}

// Run test
testEncoding().catch(console.error);
